import { db } from "@lyterion/db";
import { recording } from "@lyterion/db/schema/library";
import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import { setRecordingStatus } from "../../acquire/persist";
import { finishRun } from "../../pipeline/advance";
import { customTrackId, type WishAddPayload } from "../../wishlist/add";
import { resolveWish } from "../../wishlist/resolve";
import { acquireRecordingTask } from "./acquire-recording";

// The api image has no yt-dlp, python, cookies or PO-token server, so the slow read of a link or a name happens here,
// after the player already has its answer.
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
			await finishRun(payload.runId, "failed");
		}
	},
});
