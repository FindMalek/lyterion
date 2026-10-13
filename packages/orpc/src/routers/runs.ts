import {
	StartRunError,
	startMigrationRun,
	triggerTask,
} from "@lyterion/common/pipeline/start";
import {
	recentImports,
	storeDataExport,
} from "@lyterion/common/spotify/data-import";
import { syncState } from "@lyterion/common/spotify/sync-state";
import { database } from "@lyterion/core";
import { migrationRun } from "@lyterion/db/schema/run";
import { ORPCError } from "@orpc/server";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../procedures";

const RUNS_LIMIT = 20;

export const runsRouter = {
	list: protectedProcedure.handler(() =>
		database
			.select()
			.from(migrationRun)
			.orderBy(desc(migrationRun.startedAt))
			.limit(RUNS_LIMIT),
	),

	syncState: protectedProcedure.handler(() => syncState()),
	start: protectedProcedure
		.input(
			z
				.object({
					// Incremental by default: loadIncrementalState falls back to a full export until one has finished.
					mode: z.enum(["full", "incremental", "final"]).default("incremental"),
				})
				.optional(),
		)
		.handler(async ({ input }) => {
			try {
				return await startMigrationRun(input?.mode ?? "incremental", {
					supersede: true,
				});
			} catch (err) {
				if (err instanceof StartRunError)
					throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
				throw err;
			}
		}),
	imports: protectedProcedure.handler(() => recentImports()),
	// Spotify "Download your data" JSON files, unzipped in the browser (#12); 50 MB of JSON at most.
	importDataExport: protectedProcedure
		.input(
			z.object({
				files: z
					.record(z.string(), z.string())
					.refine(
						(f) =>
							Object.values(f).reduce((n, t) => n + t.length, 0) < 50_000_000,
					),
			}),
		)
		.handler(async ({ input }) => {
			let stored: Awaited<ReturnType<typeof storeDataExport>>;
			try {
				stored = await storeDataExport(input.files);
			} catch (err) {
				throw new ORPCError("BAD_REQUEST", {
					message: `could not read the export: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
			try {
				await triggerTask("spotify.import", { importId: stored.importId });
			} catch (err) {
				if (err instanceof StartRunError)
					throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
				throw err;
			}
			return stored;
		}),
};
