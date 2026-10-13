import { idempotencyKeys, logger, tasks } from "@trigger.dev/sdk";

import { getCredentials } from "../credentials/store";
import type { acquireRecordingTask } from "../trigger/tasks/acquire-recording";
import type { acquireReleaseTask } from "../trigger/tasks/acquire-release";
import { planAcquire } from "./plan";
import { ACQUIRE_WINDOW, claimWaiting, inFlight, unclaim } from "./queue";

/** Tops the window back up to ACQUIRE_WINDOW. Called when a run starts and after every finished track. */
export async function dispatchAcquire(runId: number): Promise<number> {
	const claimed = await claimWaiting(ACQUIRE_WINDOW - (await inFlight()));
	if (claimed.length === 0) return 0;
	const plan = planAcquire(claimed, !!(await getCredentials("slskd")));
	try {
		const key = (id: string) => idempotencyKeys.create(id, { scope: "global" });
		if (plan.releases.length > 0)
			await tasks.batchTrigger<typeof acquireReleaseTask>(
				"acquire.release",
				await Promise.all(
					plan.releases.map(async (r) => ({
						payload: {
							runId,
							releaseId: r.releaseId,
							recordingIds: r.recordings.map((x) => x.id),
						},
						options: {
							idempotencyKey: await key(
								`release:${r.releaseId}:${runId}:${Math.max(...r.recordings.map((x) => x.generation))}`,
							),
						},
					})),
				),
			);
		if (plan.singles.length > 0)
			await tasks.batchTrigger<typeof acquireRecordingTask>(
				"acquire.recording",
				await Promise.all(
					plan.singles.map(async (r) => ({
						payload: { runId, recordingId: r.id },
						options: {
							idempotencyKey: await key(
								`recording:${r.id}:${runId}:${r.generation}`,
							),
						},
					})),
				),
			);
	} catch (err) {
		// Back to the backlog; the next finished track tops up again.
		await unclaim(claimed.map((c) => c.id));
		logger.warn("acquire dispatch failed, will retry on the next top-up", {
			error: String(err),
		});
		return 0;
	}
	return claimed.length;
}
