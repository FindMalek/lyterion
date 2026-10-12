import { db } from "@lyterion/db";
import { migrationRun } from "@lyterion/db/schema/run";
import { env } from "@lyterion/env/server";
import { configure, tasks } from "@trigger.dev/sdk";
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

export async function startMigrationRun(
	mode: ExportMode = "full",
): Promise<{ runId: number }> {
	configureTrigger();
	const [running] = await db
		.select({ id: migrationRun.id })
		.from(migrationRun)
		.where(eq(migrationRun.status, "running"))
		.limit(1);
	if (running) throw new StartRunError(`run ${running.id} is still running`);

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
	return { runId: run.id };
}
