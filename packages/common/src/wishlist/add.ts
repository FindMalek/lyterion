import { randomUUID } from "node:crypto";

import { db } from "@lyterion/db";
import { recording } from "@lyterion/db/schema/library";
import { migrationRun } from "@lyterion/db/schema/run";
import { eq } from "drizzle-orm";

import { StartRunError, triggerTask } from "../pipeline/start";
import type { AcquirePayload } from "../trigger/tasks/acquire-recording";
import {
	CUSTOM_LINK_PREFIX,
	CUSTOM_TRACK_PREFIX,
	WISHLIST_RUN_KIND,
} from "./custom";
import { resolveWish, type WishMeta } from "./resolve";

export type WishDeps = {
	lookup?: (input: string) => Promise<WishMeta>;
	trigger?: (id: string, payload: AcquirePayload) => Promise<void>;
};

/** A link or a name becomes one recording in its own one-track run, then goes through the normal acquire ladder. */
export async function addWish(
	input: string,
	deps: WishDeps = {},
): Promise<{ runId: number; recordingId: string; meta: WishMeta }> {
	const [live] = await db
		.select({ id: migrationRun.id })
		.from(migrationRun)
		.where(eq(migrationRun.status, "running"))
		.limit(1);
	if (live)
		throw new StartRunError(
			"a run is already in progress, add it when that one finishes",
		);

	const meta = await (deps.lookup ?? resolveWish)(input);
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
		isrcs: meta.isrc ? [meta.isrc] : [],
		durationMs: meta.durationMs,
		// Not a Spotify track; a pasted link rides along so the youtube provider can offer exactly it.
		preferredSpotifyTrackId: meta.linkUrl
			? `${CUSTOM_LINK_PREFIX}${meta.linkUrl}`
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

export type WishState = {
	status: "working" | "placed" | "review" | "missing" | "gone";
	stage: string;
	title?: string;
	artists?: string[];
};

const WORKING = new Set(["queued", "searching", "fetching", "verifying"]);

/** Where a wishlist track is in the ladder, in the terms the player shows. */
export async function wishState(recordingId: string): Promise<WishState> {
	const [rec] = await db
		.select()
		.from(recording)
		.where(eq(recording.id, recordingId))
		.limit(1);
	if (!rec?.id.startsWith("wish-")) return { status: "gone", stage: "gone" };
	const named = { title: rec.title, artists: rec.artists };
	if (WORKING.has(rec.status))
		return { status: "working", stage: rec.status, ...named };
	if (rec.status === "placed")
		return { status: "placed", stage: rec.status, ...named };
	if (rec.status === "review")
		return { status: "review", stage: rec.status, ...named };
	return { status: "missing", stage: rec.status, ...named };
}
