import {
	StartRunError,
	startMigrationRun,
} from "@lyterion/common/pipeline/start";
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
					mode: z.enum(["full", "incremental", "final"]).default("full"),
				})
				.optional(),
		)
		.handler(async ({ input }) => {
			try {
				return await startMigrationRun(input?.mode ?? "full");
			} catch (err) {
				if (err instanceof StartRunError)
					throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
				throw err;
			}
		}),
};
