import {
	StartRunError,
	startMigrationRun,
} from "@lyterion/common/pipeline/start";
import { database } from "@lyterion/core";
import { migrationRun } from "@lyterion/db/schema/run";
import { ORPCError } from "@orpc/server";
import { desc } from "drizzle-orm";

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

	start: protectedProcedure.handler(async () => {
		try {
			return await startMigrationRun();
		} catch (err) {
			if (err instanceof StartRunError)
				throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
			throw err;
		}
	}),
};
