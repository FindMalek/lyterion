import { db } from "@lyterion/db";
import { recording } from "@lyterion/db/schema/library";
import { migrationRun } from "@lyterion/db/schema/run";
import { and, count, eq, inArray, lt, sql } from "drizzle-orm";

import type { AcquireTodo } from "./persist";

// A run marks its whole backlog `waiting` once, then keeps a small window `queued`; finishing tracks pull the next ones (#4).
export const ACQUIRE_WINDOW = 20;

const IN_FLIGHT = [
	"resolving",
	"queued",
	"searching",
	"fetching",
	"verifying",
] as const;
const LEFT_BY_A_DEAD_RUN = ["waiting", ...IN_FLIGHT] as const;

/** Only one run is ever running, so anything still waiting or in flight belongs to a run that died. */
export async function releaseStaleClaims(): Promise<number> {
	const rows = await db
		.update(recording)
		.set({ status: "resolved", updatedAt: new Date() })
		.where(inArray(recording.status, [...LEFT_BY_A_DEAD_RUN]))
		.returning({ id: recording.id });
	return rows.length;
}

/** The run's backlog: everything never placed or not found last time. Placed tracks are never redone. */
export async function markWaiting(): Promise<number> {
	const rows = await db
		.update(recording)
		.set({ status: "waiting", updatedAt: new Date() })
		.where(inArray(recording.status, ["resolved", "missing"]))
		.returning({ id: recording.id });
	return rows.length;
}

/** Claims up to `limit` waiting tracks, album by album so album mode still sees whole releases. Safe to race. */
export async function claimWaiting(limit: number): Promise<AcquireTodo[]> {
	if (limit <= 0) return [];
	const rows = await db.execute<{
		id: string;
		generation: number;
		release_id: string | null;
	}>(sql`
		update ${recording} set status = 'queued', updated_at = now()
		where ${recording.id} in (
			select ${recording.id} from ${recording}
			where ${recording.status} = 'waiting'
			order by ${recording.placedReleaseIds}[1] nulls last, ${recording.id}
			limit ${limit}
			for update skip locked
		)
		returning id, generation, placed_release_ids[1] as release_id`);
	// RETURNING has no order; sort the same way the claim picked them.
	return rows.rows
		.map((r) => ({
			id: r.id,
			generation: r.generation,
			releaseId: r.release_id,
		}))
		.sort(
			(x, y) =>
				(x.releaseId ?? "\uffff").localeCompare(y.releaseId ?? "\uffff") ||
				x.id.localeCompare(y.id),
		);
}

/** A claim whose trigger failed goes back to the backlog, so the next top-up retries it. */
export async function unclaim(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await db
		.update(recording)
		.set({ status: "waiting", updatedAt: new Date() })
		.where(and(inArray(recording.id, ids), eq(recording.status, "queued")));
}

/** True when the track was still in flight, so a crash counts it exactly once. */
export async function failIfInFlight(id: string): Promise<boolean> {
	const rows = await db
		.update(recording)
		.set({ status: "missing", updatedAt: new Date() })
		.where(and(eq(recording.id, id), inArray(recording.status, [...IN_FLIGHT])))
		.returning({ id: recording.id });
	return rows.length > 0;
}

/** In-flight tracks untouched since `before` lost their task (#139); they become `missing` so the run can close. */
export async function reapInFlight(before: Date): Promise<string[]> {
	const rows = await db
		.update(recording)
		.set({ status: "missing", updatedAt: new Date() })
		.where(
			and(
				inArray(recording.status, [...IN_FLIGHT]),
				lt(recording.updatedAt, before),
			),
		)
		.returning({ id: recording.id });
	return rows.map((r) => r.id);
}

export async function waiting(): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(recording)
		.where(eq(recording.status, "waiting"));
	return row?.n ?? 0;
}

export async function inFlight(): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(recording)
		.where(inArray(recording.status, [...IN_FLIGHT]));
	return row?.n ?? 0;
}

/** Tasks left queued in Trigger.dev by a run that failed or was replaced exit without touching anything. */
export async function runIsLive(runId: number): Promise<boolean> {
	const [row] = await db
		.select({ status: migrationRun.status })
		.from(migrationRun)
		.where(eq(migrationRun.id, runId));
	return row?.status === "running";
}
