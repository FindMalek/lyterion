import { db } from "@lyterion/db";
import { recording } from "@lyterion/db/schema/library";
import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import { setRecordingStatus } from "../../acquire/persist";
import { finishRun } from "../../pipeline/advance";
import { updateStageProgress } from "../../pipeline/progress";
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
			const error = err instanceof Error ? err.message : String(err);
			logger.error("wishlist add failed", { error });
			await setRecordingStatus(payload.recordingId, "missing");
			// On the run report instead of swallowed (#172).
			await updateStageProgress(payload.runId, "wishlist.add", {
				status: "failed",
				error,
			});
			await finishRun(payload.runId, "failed");
			throw err;
		}
	},
});
