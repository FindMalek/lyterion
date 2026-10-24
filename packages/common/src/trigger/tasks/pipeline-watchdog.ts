import { db } from "@lyterion/db";
import { migrationRun } from "@lyterion/db/schema/run";
import { logger, schedules } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import { dispatchAcquire } from "../../acquire/dispatch";
import { inFlight, reapInFlight, waiting } from "../../acquire/queue";
import { incrementStage } from "../../pipeline/advance";
import { drained, STALL_MS } from "../../pipeline/stall";
import { ACQUIRE_STAGE, closeRun } from "./acquire-recording";

/** Fails tracks whose task vanished and closes a run that has nothing left to do. Safe to call any time. */
export async function reapStalledRun(now = new Date()) {
	const [run] = await db
		.select({ id: migrationRun.id, stages: migrationRun.stages })
		.from(migrationRun)
		.where(eq(migrationRun.status, "running"))
		.limit(1);
	if (!run) return null;
	const reaped = await reapInFlight(new Date(now.getTime() - STALL_MS));
	for (const _ of reaped)
		await incrementStage(run.id, ACQUIRE_STAGE, { failed: 1 });
	if (reaped.length > 0) await dispatchAcquire(run.id);
	const left = { inFlight: await inFlight(), waiting: await waiting() };
	const closed = drained(
		run.stages as Record<string, { total?: number }>,
		left,
	);
	if (closed) await closeRun(run.id);
	if (reaped.length > 0 || closed)
		logger.warn("stalled run", {
			runId: run.id,
			reaped: reaped.length,
			closed,
		});
	return { runId: run.id, reaped: reaped.length, closed };
}

export const pipelineWatchdogTask = schedules.task({
	id: "pipeline.watchdog",
	cron: "*/30 * * * *",
	maxDuration: 300,
	run: () => reapStalledRun(),
});
