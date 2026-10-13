import { db } from "@lyterion/db";
import { migrationRun } from "@lyterion/db/schema/run";
import { env } from "@lyterion/env/server";
import { configure, runs, tasks } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import type { ExportMode } from "../spotify/sync-state";
import type { spotifyExportTask } from "../trigger/tasks/spotify-export";

export class StartRunError extends Error {}

// The api only triggers by id, so it needs the Trigger.dev secret key, not the task code.
function configureTrigger() {
	if (!env.LYTERION_TRIGGER_API_URL || !env.LYTERION_TRIGGER_SECRET_KEY)
		throw new StartRunError(
			"Trigger.dev is not connected (LYTERION_TRIGGER_API_URL and LYTERION_TRIGGER_SECRET_KEY)",
		);
	configure({
		baseURL: env.LYTERION_TRIGGER_API_URL,
		accessToken: env.LYTERION_TRIGGER_SECRET_KEY,
	});
}

export async function triggerTask(id: string, payload: unknown): Promise<void> {
	configureTrigger();
	try {
		await tasks.trigger(id, payload);
	} catch (err) {
		throw new StartRunError(
			`Trigger.dev refused ${id}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

// Every task a migration run fans into; a new run cancels whatever of these an older run left alive.
export const PIPELINE_TASKS = [
	"spotify.export",
	"identity.resolve",
	"acquire.recording",
	"acquire.release",
];
/** Marks older runs cancelled and bulk-cancels their tasks, old deploy versions included. Only jobs created before now. */
export async function supersedeRuns(): Promise<number[]> {
	const stopped = await db
		.update(migrationRun)
		.set({ status: "cancelled", finishedAt: new Date() })
		.where(eq(migrationRun.status, "running"))
		.returning({ id: migrationRun.id });
	try {
		await runs.bulk.cancel({
			name: `superseded by a new run (was ${stopped.map((r) => r.id).join(", ") || "none running"})`,
			filter: {
				taskIdentifier: PIPELINE_TASKS,
				status: [
					"PENDING_VERSION",
					"DELAYED",
					"QUEUED",
					"DEQUEUED",
					"EXECUTING",
					"WAITING",
				],
				to: new Date(),
			},
		});
	} catch (err) {
		// Not fatal: tasks of a run that is no longer running exit on their own (D-046).
		console.warn("bulk cancel of older pipeline tasks failed", err);
	}
	return stopped.map((r) => r.id);
}

/** `supersede` stops whatever run is going (the dashboard's start); without it a running run blocks (the daily cron). */
export async function startMigrationRun(
	mode: ExportMode = "full",
	{ supersede = false }: { supersede?: boolean } = {},
): Promise<{ runId: number; superseded: number[] }> {
	configureTrigger();
	let superseded: number[] = [];
	if (supersede) superseded = await supersedeRuns();
	else {
		const [running] = await db
			.select({ id: migrationRun.id })
			.from(migrationRun)
			.where(eq(migrationRun.status, "running"))
			.limit(1);
		if (running) throw new StartRunError(`run ${running.id} is still running`);
	}

	const [run] = await db
		.insert(migrationRun)
		.values({ options: { mode } })
		.returning({ id: migrationRun.id });
	if (!run) throw new StartRunError("could not create the run");
	try {
		await tasks.trigger<typeof spotifyExportTask>("spotify.export", {
			runId: run.id,
			mode,
		});
	} catch (err) {
		await db
			.update(migrationRun)
			.set({ status: "failed", finishedAt: new Date() })
			.where(eq(migrationRun.id, run.id));
		throw new StartRunError(
			`Trigger.dev refused the run: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	return { runId: run.id, superseded };
}
