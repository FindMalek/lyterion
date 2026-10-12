import { auth, database } from "@lyterion/core";
import { account, user } from "@lyterion/db/schema/auth";
import { logger, task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";

import { updateStageProgress } from "../../pipeline/progress";
import { createSpotifyClient } from "../../spotify/client";
import { exportLibrary } from "../../spotify/export";
import { persistExport, saveExportPage } from "../../spotify/persist";

const STAGE = "spotify.export";

async function ownerSpotifyAccount(): Promise<{
	userId: string;
	accountId: string;
}> {
	const [owner] = await database
		.select({ userId: user.id, accountId: account.id })
		.from(user)
		.innerJoin(
			account,
			and(eq(account.userId, user.id), eq(account.providerId, "spotify")),
		)
		.limit(1);
	if (!owner)
		throw new Error(
			"no owner with a linked Spotify account yet, sign in with Spotify first",
		);
	return owner;
}

export const spotifyExportTask = task({
	id: STAGE,
	queue: { name: "spotify", concurrencyLimit: 1 },
	maxDuration: 3600,
	run: async ({ runId }: { runId: number }) => {
		const selection = await ownerSpotifyAccount();
		await updateStageProgress(runId, STAGE, {
			status: "running",
			startedAt: new Date().toISOString(),
		});
		const client = createSpotifyClient(async (forceRefresh) => {
			const result = forceRefresh
				? await auth.api.refreshToken({
						body: selection,
					})
				: await auth.api.getAccessToken({
						body: selection,
					});
			if (!result.accessToken)
				throw new Error("spotify token unavailable, reconnect Spotify");
			return result.accessToken;
		});
		let pages = 0;
		try {
			const out = await exportLibrary(client, {
				onPage: async (endpoint, items) => {
					pages++;
					await saveExportPage(runId, endpoint, items);
				},
			});
			await persistExport(out);
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
			};
			logger.info("spotify export done", summary);
			await updateStageProgress(runId, STAGE, {
				status: "done",
				total: out.tracks.size,
				done: out.tracks.size,
				failed: 0,
				finishedAt: new Date().toISOString(),
			});
			return summary;
		} catch (err) {
			await updateStageProgress(runId, STAGE, {
				status: "failed",
				finishedAt: new Date().toISOString(),
			});
			throw err;
		}
	},
});
