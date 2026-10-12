import { logger, task } from "@trigger.dev/sdk";

import { claimStage, finishRun } from "../../pipeline/advance";
import { updateStageProgress } from "../../pipeline/progress";
import { exportLibrary } from "../../spotify/export";
import { ownerSpotifyAccount, ownerSpotifyClient } from "../../spotify/owner";
import { persistExport, saveExportPage } from "../../spotify/persist";
import {
	type ExportMode,
	loadIncrementalState,
	markExported,
} from "../../spotify/sync-state";
import { identityResolveTask } from "./identity-resolve";

const STAGE = "spotify.export";

export const spotifyExportTask = task({
	id: STAGE,
	queue: { name: "spotify", concurrencyLimit: 1 },
	maxDuration: 3600,
	run: async ({
		runId,
		mode = "full",
	}: {
		runId: number;
		mode?: ExportMode;
	}) => {
		const startedAt = new Date();
		const selection = await ownerSpotifyAccount();
		await updateStageProgress(runId, STAGE, {
			status: "running",
			startedAt: new Date().toISOString(),
		});
		const client = ownerSpotifyClient(selection);
		let pages = 0;
		try {
			const incremental =
				mode === "incremental" ? await loadIncrementalState() : null;
			const out = await exportLibrary(
				client,
				{
					onPage: async (endpoint, items) => {
						pages++;
						await saveExportPage(runId, endpoint, items);
					},
				},
				incremental ?? undefined,
			);
			await persistExport(out);
			await markExported(mode, startedAt);
			const summary = {
				tracks: out.tracks.size,
				albums: out.albums.size,
				artists: out.artists.size,
				playlists: out.playlists.length,
				unavailablePlaylists: out.playlists.filter((p) => p.itemsUnavailable)
					.length,
				entries: out.entries.length,
				...out.skipped,
				pages,
				mode: incremental ? "incremental" : mode === "final" ? "final" : "full",
				unchangedPlaylists: out.unchangedPlaylists.size,
			};
			logger.info("spotify export done", summary);
			await updateStageProgress(runId, STAGE, {
				status: "done",
				total: out.tracks.size,
				done: out.tracks.size,
				failed: 0,
				finishedAt: new Date().toISOString(),
			});
			if (await claimStage(runId, "identity.resolve"))
				await identityResolveTask.trigger({ runId });
			return summary;
		} catch (err) {
			await updateStageProgress(runId, STAGE, {
				status: "failed",
				finishedAt: new Date().toISOString(),
			});
			await finishRun(runId, "failed");
			throw err;
		}
	},
});
