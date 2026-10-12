import { database } from "@lyterion/core";
import { migrationRun } from "@lyterion/db/schema/run";
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
};
