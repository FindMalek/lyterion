import { db } from "@lyterion/db";
import { recording } from "@lyterion/db/schema/library";
import { migrationRun } from "@lyterion/db/schema/run";
import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import { setRecordingStatus } from "../../acquire/persist";
import { finishRun } from "../../pipeline/advance";
import { customTrackId, type WishAddPayload } from "../../wishlist/add";
import { resolveWish } from "../../wishlist/resolve";
import { acquireRecordingTask } from "./acquire-recording";

// The slow yt-dlp read lives here, not in the api image (no yt-dlp, cookies or PO-token server), after the player has its answer.
export const wishlistAddTask = task({
	id: "wishlist.add",
	maxDuration: 300,
	retry: { maxAttempts: 1 },
	run: async (payload: WishAddPayload) => {
		try {
			const meta = await resolveWish(payload.input, {
				youtubeOptions: {
					cookiesPath: env.LYTERION_YTDLP_COOKIES_PATH,
					potProviderUrl: env.LYTERION_YTDLP_POT_PROVIDER_URL,
					binary: env.LYTERION_YTDLP_PATH,
				},
			});
			await db
				.update(recording)
				.set({
					title: meta.title,
					artists: meta.artists,
					isrcs: meta.isrc ? [meta.isrc] : [],
					durationMs: meta.durationMs,
					preferredSpotifyTrackId: customTrackId(
						meta,
						payload.recordingId.replace(/^wish-/, ""),
					),
					status: "queued",
					updatedAt: new Date(),
				})
				.where(eq(recording.id, payload.recordingId));
			await acquireRecordingTask.trigger({
				runId: payload.runId,
				recordingId: payload.recordingId,
			});
		} catch (err) {
			logger.error("wishlist lookup failed", { error: String(err) });
			await setRecordingStatus(payload.recordingId, "missing");
			await db
				.update(migrationRun)
				.set({ report: { error: String(err) } })
				.where(eq(migrationRun.id, payload.runId));
			await finishRun(payload.runId, "failed");
		}
	},
});
