import { db } from "@lyterion/db";
import { migrationRun } from "@lyterion/db/schema/run";
import { logger, schedules } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import { syncState } from "../../spotify/sync-state";
import { reapStalledRun } from "./pipeline-watchdog";
import { spotifyExportTask } from "./spotify-export";

// D-029: daily while Spotify is still in use; new likes, saves and playlist edits flow through the same pipeline.
export const spotifySyncTask = schedules.task({
	id: "spotify.sync",
	cron: "17 5 * * *",
	maxDuration: 300,
	run: async () => {
		const state = await syncState();
		if (!state.dailySync)
			return { skipped: "daily sync is off since the final export" };
		await reapStalledRun();
		const [running] = await db
			.select({ id: migrationRun.id })
			.from(migrationRun)
			.where(eq(migrationRun.status, "running"))
			.limit(1);
		if (running) return { skipped: `run ${running.id} is still running` };
		const mode = state.lastSync ? "incremental" : "full";
		const [run] = await db
			.insert(migrationRun)
			.values({ options: { mode } })
			.returning({ id: migrationRun.id });
		if (!run) throw new Error("could not create the run");
		await spotifyExportTask.trigger({ runId: run.id, mode });
		logger.info("daily sync started", { runId: run.id, mode });
		return { runId: run.id, mode };
	},
});
