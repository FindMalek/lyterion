import { logger, task } from "@trigger.dev/sdk";

import { loadAcquireJob } from "../../acquire/persist";
import { withAlbumResults } from "../../acquire/plan";
import { configuredProviders } from "../../credentials/providers";
import type { Candidate, Provider } from "../../providers/types";
import {
	type AcquirePayload,
	acquireOne,
	acquireQueue,
} from "./acquire-recording";

export type AcquireReleasePayload = {
	runId: number;
	releaseId: string;
	recordingIds: string[];
};

type AlbumSearch = Provider & {
	searchRelease(release: {
		artist: string;
		album: string;
		tracks: Parameters<Provider["search"]>[0][];
	}): Promise<Map<string, Candidate[]>>;
};

function hasAlbumSearch(p: Provider): p is AlbumSearch {
	return "searchRelease" in p;
}

// Album mode (docs/providers.md): one slskd search for the release, then each track goes through the usual path.
export const acquireReleaseTask = task({
	id: "acquire.release",
	queue: acquireQueue,
	maxDuration: 3 * 3600,
	run: async (payload: AcquireReleasePayload) => {
		const providers = await configuredProviders();
		const jobs = (
			await Promise.all(payload.recordingIds.map((id) => loadAcquireJob(id)))
		).filter((j) => j !== null);
		const slskd = providers.find(hasAlbumSearch);
		const first = jobs[0];
		let found = new Map<string, Candidate[]>();
		if (slskd && first) {
			try {
				found = await slskd.searchRelease({
					artist: first.placement.albumArtist,
					album: first.placement.album,
					tracks: jobs.map((j) => j.target),
				});
			} catch (err) {
				logger.warn("album search failed, searching per track", {
					error: String(err),
				});
			}
		}
		const results: Record<string, string> = {};
		for (const id of payload.recordingIds) {
			const one: AcquirePayload = { runId: payload.runId, recordingId: id };
			results[id] = (
				await acquireOne(one, withAlbumResults(providers, slskd, found.get(id)))
			).status;
		}
		logger.info("release acquired", {
			releaseId: payload.releaseId,
			albumHits: [...found.values()].filter((c) => c.length > 0).length,
			results,
		});
		return results;
	},
});
