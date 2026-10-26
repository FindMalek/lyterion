import { randomUUID } from "node:crypto";

import { db } from "@lyterion/db";
import { recording } from "@lyterion/db/schema/library";
import { migrationRun } from "@lyterion/db/schema/run";
import { eq } from "drizzle-orm";

import { StartRunError, triggerTask } from "../pipeline/start";
import {
	CUSTOM_LINK_PREFIX,
	CUSTOM_TRACK_PREFIX,
	WISHLIST_RUN_KIND,
} from "./custom";
import { quickWish, type WishMeta } from "./resolve";

// Trigger.dev reads priority as seconds ahead in the queue: someone waiting at the player jumps the backlog.
export const WISHLIST_PRIORITY_S = 600;

export type WishPayload = { runId: number; recordingId: string };
export type WishAddPayload = WishPayload & { input: string };

export type WishDeps = {
	quick?: (input: string) => Promise<WishMeta>;
	trigger?: (
		id: string,
		payload: WishAddPayload | WishPayload,
	) => Promise<void>;
};

/** The id the recording keeps in place of a Spotify track; a pasted link rides along so the youtube provider offers exactly it. */
export function customTrackId(meta: WishMeta, id: string): string {
	return meta.linkUrl
		? `${CUSTOM_LINK_PREFIX}${meta.linkUrl}`
		: `${CUSTOM_TRACK_PREFIX}${id}`;
}

/**
 * A link or a name becomes one recording in its own one-track run. When the first look knows the length it goes straight
 * to the acquire ladder; otherwise it waits as `resolving` while the add task reads it with yt-dlp, so the player never
 * waits on that.
 */
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

	const meta = await (deps.quick ?? quickWish)(input);
	const known = meta.durationMs > 0;
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
		preferredSpotifyTrackId: customTrackId(meta, id),
		status: known ? "queued" : "resolving",
	});
	try {
		const send =
			deps.trigger ??
			((id, payload) =>
				triggerTask(id, payload, { priority: WISHLIST_PRIORITY_S }));
		if (known) await send("acquire.recording", { runId: run.id, recordingId });
		else await send("wishlist.add", { runId: run.id, recordingId, input });
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

const WORKING = new Set([
	"resolving",
	"queued",
	"searching",
	"fetching",
	"verifying",
]);

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
