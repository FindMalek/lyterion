import { db } from "@lyterion/db";
import { migrationRun, stageTrigger } from "@lyterion/db/schema/run";
import { eq, sql } from "drizzle-orm";

// D-014: counters move in one statement, and the (run, stage) unique key makes the next stage start once.
export async function incrementStage(
	runId: number,
	stage: string,
	by: { done?: number; failed?: number },
): Promise<{ total: number; done: number; failed: number }> {
	const path = `{${stage}}`;
	const [row] = await db
		.update(migrationRun)
		.set({
			stages: sql`jsonb_set(${migrationRun.stages}, ${path}::text[],
				coalesce(${migrationRun.stages} -> ${stage}, '{}'::jsonb)
				|| jsonb_build_object(
					'done', coalesce((${migrationRun.stages} -> ${stage} ->> 'done')::int, 0) + ${by.done ?? 0},
					'failed', coalesce((${migrationRun.stages} -> ${stage} ->> 'failed')::int, 0) + ${by.failed ?? 0}
				))`,
		})
		.where(eq(migrationRun.id, runId))
		.returning({
			stage: sql<{
				total?: number;
				done: number;
				failed: number;
			}>`${migrationRun.stages} -> ${stage}`,
		});
	const progress = row?.stage;
	return {
		total: progress?.total ?? 0,
		done: progress?.done ?? 0,
		failed: progress?.failed ?? 0,
	};
}

export function stageComplete(progress: {
	total: number;
	done: number;
	failed: number;
}) {
	return (
		progress.total > 0 && progress.done + progress.failed >= progress.total
	);
}

/** True for exactly one caller per (run, stage); that caller triggers the stage. */
export async function claimStage(
	runId: number,
	stage: string,
): Promise<boolean> {
	const rows = await db
		.insert(stageTrigger)
		.values({ runId, stage })
		.onConflictDoNothing()
		.returning({ id: stageTrigger.id });
	return rows.length > 0;
}

export async function finishRun(
	runId: number,
	status: "done" | "failed",
): Promise<void> {
	await db
		.update(migrationRun)
		.set({ status, finishedAt: new Date() })
		.where(eq(migrationRun.id, runId));
}
