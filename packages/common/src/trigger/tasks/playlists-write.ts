import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "@lyterion/db";
import { playlistWrite } from "@lyterion/db/schema/library";
import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";
import { sql } from "drizzle-orm";

import { writePlaylist } from "../../library/playlist";
import { playlistSpecs } from "../../library/playlists-persist";

async function downloadCover(
	url: string,
	dest: string,
): Promise<string | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
		if (!res.ok) return null;
		await writeFile(dest, Buffer.from(await res.arrayBuffer()));
		return dest;
	} catch {
		return null;
	}
}

/** D-008: m3u8 + sidecar cover per playlist; Lyterion is the source of truth, rewritten only when content changes. */
export async function writeAllPlaylists() {
	const libraryRoot = path.join(
		env.LYTERION_MUSIC_DIR,
		env.LYTERION_LIBRARY_SUBDIR,
	);
	const specs = await playlistSpecs();
	let changed = 0;
	let missing = 0;
	for (const [i, spec] of specs.entries()) {
		const cover = spec.imageUrl
			? await downloadCover(
					spec.imageUrl,
					path.join(env.LYTERION_STAGING_DIR, `playlist-cover-${i}.jpg`),
				)
			: null;
		try {
			const written = await writePlaylist(
				{ ...spec, coverPath: cover },
				libraryRoot,
			);
			if (written.changed) changed++;
			missing += written.missing;
			const now = new Date();
			await db
				.insert(playlistWrite)
				.values({
					name: spec.name,
					path: written.path,
					entries: spec.entries.length,
					missing: written.missing,
					writtenAt: now,
					checkedAt: now,
				})
				.onConflictDoUpdate({
					target: playlistWrite.name,
					set: {
						path: written.path,
						entries: spec.entries.length,
						missing: written.missing,
						checkedAt: now,
						writtenAt: written.changed ? now : sql`${playlistWrite.writtenAt}`,
					},
				});
		} finally {
			if (cover) await rm(cover, { force: true });
		}
	}
	logger.info("playlists written", {
		playlists: specs.length,
		changed,
		missing,
	});
	return { playlists: specs.length, changed, missing };
}

// Manual entry point (dashboard or CLI); scans call writeAllPlaylists inline.
export const playlistsWriteTask = task({
	id: "playlists.write",
	queue: { name: "navidrome", concurrencyLimit: 1 },
	maxDuration: 1800,
	run: () => writeAllPlaylists(),
});
