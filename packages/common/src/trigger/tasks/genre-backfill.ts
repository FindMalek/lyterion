import { access } from "node:fs/promises";

import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";

import { fileHasGenre, genreCandidates } from "../../library/genre-backfill";
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

// Opt in (D-054): fills a missing GENRE on files Lyterion didn't write, from the Spotify artist genres. Never replaces a
// genre that is there, and touches nothing else. Dry run unless `apply: true`.
export const genreBackfillTask = task({
	id: "genre.backfill",
	queue: { name: "library", concurrencyLimit: 1 },
	maxDuration: 6 * 3600,
	run: async ({ apply = false }: { apply?: boolean }) => {
		const candidates = await genreCandidates();
		let missing = 0;
		let written = 0;
		const sample: { path: string; genres: string[] }[] = [];
		for (const { path, genres } of candidates) {
			if (!(await exists(path))) continue;
			if (await fileHasGenre(path).catch(() => true)) continue;
			missing++;
			if (sample.length < 20) sample.push({ path, genres });
			if (!apply) continue;
			try {
				await writeTags(
					path,
					{ GENRE: genres },
					null,
					env.LYTERION_PYTHON,
					true,
				);
				written++;
			} catch (err) {
				logger.warn("genre write failed", { path, err });
			}
		}
		if (written > 0) await requestScan(written);
		logger.info("genre backfill done", { apply, missing, written, sample });
		return { apply, missing, written, sample };
	},
});
