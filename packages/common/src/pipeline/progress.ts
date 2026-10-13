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

/** The stage's error as the dashboard shows it: one line, short enough for a table cell's tooltip. */
export function errorText(err: unknown): string {
	const text = err instanceof Error ? err.message : String(err);
	const cause =
		err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
	return (cause ? `${cause} (${text})` : text)
		.replace(/\s+/g, " ")
		.slice(0, 500);
}
