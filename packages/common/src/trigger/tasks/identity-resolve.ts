import { env } from "@lyterion/env/server";
import { idempotencyKeys, logger, task } from "@trigger.dev/sdk";

import { recordingsToAcquire } from "../../acquire/persist";
import { planAcquire } from "../../acquire/plan";
import { getCredentials } from "../../credentials/store";
import { runIdentityResolve } from "../../identity/persist";
import { createNavidromeClient } from "../../navidrome/client";
import { indexExistingLibrary } from "../../navidrome/index-persist";
import { finishRun } from "../../pipeline/advance";
import { updateStageProgress } from "../../pipeline/progress";
import { chunk } from "../utils/chunk";
import { ACQUIRE_STAGE, acquireRecordingTask } from "./acquire-recording";
import { acquireReleaseTask } from "./acquire-release";

const BATCH = 500;

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
			const todo = await recordingsToAcquire();
			await updateStageProgress(runId, ACQUIRE_STAGE, {
				status: todo.length > 0 ? "running" : "done",
				total: todo.length,
				done: 0,
				failed: 0,
				startedAt: new Date().toISOString(),
			});
			if (todo.length === 0) {
				await finishRun(runId, "done");
				return { ...summary, acquire: 0 };
			}
			const plan = planAcquire(todo, !!(await getCredentials("slskd")));
			for (const batch of chunk(plan.releases, BATCH)) {
				await acquireReleaseTask.batchTrigger(
					await Promise.all(
						batch.map(async (r) => ({
							payload: {
								runId,
								releaseId: r.releaseId,
								recordingIds: r.recordings.map((x) => x.id),
							},
							options: {
								idempotencyKey: await idempotencyKeys.create(
									`release:${r.releaseId}:${runId}:${Math.max(...r.recordings.map((x) => x.generation))}`,
									{ scope: "global" },
								),
							},
						})),
					),
				);
			}
			// One attempt per recording per run; the generation lets the owner force a retry inside a run.
			for (const batch of chunk(plan.singles, BATCH)) {
				await acquireRecordingTask.batchTrigger(
					await Promise.all(
						batch.map(async (r) => ({
							payload: { runId, recordingId: r.id },
							options: {
								idempotencyKey: await idempotencyKeys.create(
									`recording:${r.id}:${runId}:${r.generation}`,
									{ scope: "global" },
								),
							},
						})),
					),
				);
			}
			return {
				...summary,
				acquire: todo.length,
				albums: plan.releases.length,
			};
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
