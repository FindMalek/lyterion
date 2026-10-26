import { db } from "@lyterion/db";
import { migrationRun } from "@lyterion/db/schema/run";
import { env } from "@lyterion/env/server";
import {
	type AnyTask,
	configure,
	runs,
	type TaskIdentifier,
	type TaskOutput,
	type TaskPayload,
	tasks,
} from "@trigger.dev/sdk";
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

export async function triggerTask(
	id: string,
	payload: unknown,
	options?: { priority?: number },
): Promise<void> {
	configureTrigger();
	try {
		await tasks.trigger(id, payload, options);
	} catch (err) {
		throw new StartRunError(
			`Trigger.dev refused ${id}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

const RUN_POLL_MS = 500;

/** Triggers a task and waits for its output, for the short lookups the player waits on. Stops waiting at the deadline. */
export async function runTask<TTask extends AnyTask>(
	id: TaskIdentifier<TTask>,
	payload: TaskPayload<TTask>,
	timeoutMs = 90_000,
): Promise<TaskOutput<TTask>> {
	configureTrigger();
	const deadline = Date.now() + timeoutMs;
	try {
		const handle = await tasks.trigger<TTask>(id, payload);
		while (Date.now() < deadline) {
			const run = await runs.retrieve(handle.id);
			if (run.isSuccess) return run.output as TaskOutput<TTask>;
			if (run.isCompleted)
				throw new Error(run.error?.message ?? `${id} failed`);
			await new Promise((resolve) => setTimeout(resolve, RUN_POLL_MS));
		}
		throw new Error(`${id} took too long, try again`);
	} catch (err) {
		throw new StartRunError(
			err instanceof Error ? err.message : `Trigger.dev refused ${id}`,
		);
	}
}

/** Many runs of one task in as few calls as Trigger.dev allows (500 a batch). */
export async function triggerTasks(
	id: string,
	payloads: unknown[],
	options?: { priority?: number },
): Promise<void> {
	configureTrigger();
	for (let i = 0; i < payloads.length; i += 500) {
		try {
			await tasks.batchTrigger(
				id,
				payloads.slice(i, i + 500).map((payload) => ({ payload, options })),
			);
		} catch (err) {
			throw new StartRunError(
				`Trigger.dev refused ${id}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
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
