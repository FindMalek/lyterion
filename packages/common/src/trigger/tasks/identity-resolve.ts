import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";

import { dispatchAcquire } from "../../acquire/dispatch";
import { markWaiting, releaseStaleClaims } from "../../acquire/queue";
import { getCredentials } from "../../credentials/store";
import { runIdentityResolve } from "../../identity/persist";
import { createNavidromeClient } from "../../navidrome/client";
import { indexExistingLibrary } from "../../navidrome/index-persist";
import { finishRun } from "../../pipeline/advance";
import { errorText, updateStageProgress } from "../../pipeline/progress";
import { ACQUIRE_STAGE } from "./acquire-recording";

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
			const stale = await releaseStaleClaims();
			if (stale > 0)
				logger.info("released claims left by a dead run", { stale });
			const summary = await runIdentityResolve();
			logger.info("identity resolved", summary);
			await updateStageProgress(runId, STAGE, {
				status: "done",
				total: summary.tracks,
				done: summary.tracks,
				failed: 0,
				finishedAt: new Date().toISOString(),
			});
			// library.index (#18): what the owner already has never gets queued.
			const navidrome = await getCredentials("navidrome");
			if (navidrome) {
				try {
					const indexed = await indexExistingLibrary(
						createNavidromeClient(navidrome),
						{
							musicDir: env.LYTERION_MUSIC_DIR,
							librarySubdir: env.LYTERION_LIBRARY_SUBDIR,
						},
					);
					logger.info("existing library indexed", indexed);
				} catch (err) {
					logger.warn("library.index failed, continuing without it", {
						error: String(err),
					});
				}
			}
			const backlog = await markWaiting();
			await updateStageProgress(runId, ACQUIRE_STAGE, {
				status: backlog > 0 ? "running" : "done",
				total: backlog,
				done: 0,
				failed: 0,
				startedAt: new Date().toISOString(),
			});
			if (backlog === 0) {
				await finishRun(runId, "done");
				return { ...summary, acquire: 0 };
			}
			const dispatched = await dispatchAcquire(runId);
			return { ...summary, acquire: backlog, dispatched };
		} catch (err) {
			await updateStageProgress(runId, STAGE, {
				status: "failed",
				finishedAt: new Date().toISOString(),
				error: errorText(err),
			});
			await finishRun(runId, "failed");
			throw err;
		}
	},
});
