import { db } from "@lyterion/db";
import { migrationRun, type StageProgress } from "@lyterion/db/schema/run";
import { eq, sql } from "drizzle-orm";

// Merges one stage's fields in place so concurrent stages never overwrite each other (D-014).
export async function updateStageProgress(
	runId: number,
	stage: string,
	patch: Partial<StageProgress>,
): Promise<void> {
	await db
		.update(migrationRun)
		.set({
			stages: sql`jsonb_set(${migrationRun.stages}, ${`{${stage}}`}::text[], coalesce(${migrationRun.stages} -> ${stage}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb)`,
		})
		.where(eq(migrationRun.id, runId));
}
