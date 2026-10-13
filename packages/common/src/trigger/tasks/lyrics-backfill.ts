import { access, readFile } from "node:fs/promises";

import { db } from "@lyterion/db";
import { libraryFile, recording, release } from "@lyterion/db/schema/library";
import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";
import { and, eq, isNotNull } from "drizzle-orm";

import { lrclibPace } from "../../acquire/persist";
import { fetchLyrics, lrcPath, writeLyrics } from "../../library/extras";
import { writeTags } from "../../library/place";
import { requestScan } from "./navidrome-scan";

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

// Files placed before lyrics were embedded, or whose lookup missed: fetch, embed in the tags, and write the .lrc (D-050).
export const lyricsBackfillTask = task({
	id: "lyrics.backfill",
	queue: { name: "lyrics", concurrencyLimit: 1 },
	maxDuration: 6 * 3600,
	run: async ({ force = false }: { force?: boolean }) => {
		const files = await db
			.select({
				path: libraryFile.path,
				title: recording.title,
				artists: recording.artists,
				durationMs: recording.durationMs,
				album: release.title,
			})
			.from(libraryFile)
			.innerJoin(recording, eq(recording.id, libraryFile.recordingId))
			.leftJoin(release, eq(release.id, libraryFile.releaseId))
			.where(and(eq(libraryFile.owned, true), isNotNull(libraryFile.path)));
		let found = 0;
		let missed = 0;
		let embedded = 0;
		for (const file of files) {
			if (!(await exists(file.path))) continue;
			// A sidecar from before embedding: copy it into the tags, no lookup needed.
			if (!force && (await exists(lrcPath(file.path)))) {
				const lrc = (await readFile(lrcPath(file.path), "utf8")).trim();
				if (lrc) {
					await writeTags(
						file.path,
						{ LYRICS: [lrc] },
						null,
						env.LYTERION_PYTHON,
						true,
					).then(
						() => embedded++,
						(err: unknown) =>
							logger.warn("embed failed", { path: file.path, err }),
					);
				}
				continue;
			}
			const lyrics = await fetchLyrics(
				{
					artist: file.artists[0] ?? "",
					title: file.title,
					album: file.album,
					durationMs: file.durationMs,
				},
				fetch,
				lrclibPace,
			).catch((err: unknown) => {
				logger.warn("lrclib lookup failed", { path: file.path, err });
				return null;
			});
			if (lyrics) {
				try {
					await writeTags(
						file.path,
						{ LYRICS: [lyrics] },
						null,
						env.LYTERION_PYTHON,
						true,
					);
					await writeLyrics(file.path, lyrics);
					found++;
				} catch (err) {
					logger.warn("lyrics write failed", { path: file.path, err });
				}
			} else missed++;
		}
		if (found + embedded > 0) await requestScan(found + embedded);
		logger.info("lyrics backfill done", { found, missed, embedded });
		return { found, missed, embedded };
	},
});
