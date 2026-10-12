import { logger, task } from "@trigger.dev/sdk";

import { runIdentityResolve } from "../../identity/persist";
import { finishRun } from "../../pipeline/advance";
import { updateStageProgress } from "../../pipeline/progress";

const STAGE = "identity.resolve";

export const identityResolveTask = task({
	id: STAGE,
	queue: { name: "identity", concurrencyLimit: 1 },
	maxDuration: 1800,
	run: async ({ runId }: { runId: number }) => {
		await updateStageProgress(runId, STAGE, {
			status: "running",
			startedAt: new Date().toISOString(),
		});
		try {
			const summary = await runIdentityResolve();
			logger.info("identity resolved", summary);
			await updateStageProgress(runId, STAGE, {
				status: "done",
				total: summary.tracks,
				done: summary.tracks,
				failed: 0,
				finishedAt: new Date().toISOString(),
			});
			// Last stage until acquire.* lands (#25).
			await finishRun(runId, "done");
			return summary;
		} catch (err) {
			await updateStageProgress(runId, STAGE, {
				status: "failed",
				finishedAt: new Date().toISOString(),
			});
			await finishRun(runId, "failed");
			throw err;
		}
	},
});
