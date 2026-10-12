import {
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// Stage bookkeeping per docs/pipeline.md, D-014.
export type StageProgress = {
	status: "pending" | "running" | "done" | "failed";
	total: number;
	done: number;
	failed: number;
	startedAt?: string;
	finishedAt?: string;
};

export const migrationRun = pgTable("migration_run", {
	id: serial("id").primaryKey(),
	status: text("status")
		.$type<"running" | "done" | "failed" | "cancelled">()
		.notNull()
		.default("running"),
	stages: jsonb("stages")
		.$type<Record<string, StageProgress>>()
		.notNull()
		.default({}),
	options: jsonb("options")
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	report: jsonb("report").$type<Record<string, unknown>>(),
	startedAt: timestamp("started_at").defaultNow().notNull(),
	finishedAt: timestamp("finished_at"),
});

export const stageTrigger = pgTable(
	"stage_trigger",
	{
		id: serial("id").primaryKey(),
		runId: integer("run_id")
			.notNull()
			.references(() => migrationRun.id, { onDelete: "cascade" }),
		stage: text("stage").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("stage_trigger_run_stage_idx").on(table.runId, table.stage),
	],
);
