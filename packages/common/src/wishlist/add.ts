import { randomUUID } from "node:crypto";

import { db } from "@lyterion/db";
import { recording } from "@lyterion/db/schema/library";
import { migrationRun } from "@lyterion/db/schema/run";
import { eq } from "drizzle-orm";

import { StartRunError, triggerTask } from "../pipeline/start";
import { createYoutubeLookup, type YoutubeMeta } from "../providers/youtube";
import type { AcquirePayload } from "../trigger/tasks/acquire-recording";
import {
	CUSTOM_TRACK_PREFIX,
	CUSTOM_YOUTUBE_PREFIX,
	WISHLIST_RUN_KIND,
} from "./custom";

export type WishDeps = {
	lookup?: (input: string) => Promise<YoutubeMeta>;
	trigger?: (id: string, payload: AcquirePayload) => Promise<void>;
};

/** A link or a name becomes one recording in its own one-track run, then goes through the normal acquire ladder. */
export async function addWish(
	input: string,
	deps: WishDeps = {},
): Promise<{ runId: number; recordingId: string; meta: YoutubeMeta }> {
	const [live] = await db
		.select({ id: migrationRun.id })
		.from(migrationRun)
		.where(eq(migrationRun.status, "running"))
		.limit(1);
	if (live)
		throw new StartRunError(
			"a run is already in progress, add it when that one finishes",
		);

	const meta = await (deps.lookup ?? createYoutubeLookup())(input);
	const id = randomUUID();
	const recordingId = `wish-${id}`;
	const [run] = await db
		.insert(migrationRun)
		.values({
			stages: {
				acquire: { status: "running", total: 1, done: 0, failed: 0 },
			},
			options: { kind: WISHLIST_RUN_KIND, input },
		})
		.returning({ id: migrationRun.id });
	if (!run) throw new Error("could not start the run");
	await db.insert(recording).values({
		id: recordingId,
		title: meta.title,
		artists: meta.artists,
		durationMs: meta.durationMs,
		// Not a Spotify track; acquire only reads it to look up an album that isn't there.
		preferredSpotifyTrackId: meta.videoId
			? `${CUSTOM_YOUTUBE_PREFIX}${meta.videoId}`
			: `${CUSTOM_TRACK_PREFIX}${id}`,
		status: "queued",
	});
	try {
		await (deps.trigger ?? triggerTask)("acquire.recording", {
			runId: run.id,
			recordingId,
		});
	} catch (err) {
		await db
			.update(migrationRun)
			.set({ status: "failed", finishedAt: new Date() })
			.where(eq(migrationRun.id, run.id));
		throw err;
	}
	return { runId: run.id, recordingId, meta };
}
