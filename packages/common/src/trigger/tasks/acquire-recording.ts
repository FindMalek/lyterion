import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";

import { acquireRecording } from "../../acquire/acquire";
import { diskGuard } from "../../acquire/disk";
import {
	createPlacer,
	loadAcquireJob,
	recordOutcome,
	setRecordingStatus,
} from "../../acquire/persist";
import { configuredProviders } from "../../credentials/providers";
import { getCredentials } from "../../credentials/store";
import {
	claimStage,
	finishRun,
	incrementStage,
	stageComplete,
} from "../../pipeline/advance";
import { createAcoustidClient } from "../../verify/acoustid";
import { verifyFile } from "../../verify/index";

export const ACQUIRE_STAGE = "acquire";
const PAUSE_DELAY = "10m";

export type AcquirePayload = { runId: number; recordingId: string };

// One recording per run (docs/pipeline.md): the last one to finish closes the migration run (D-014).
export const acquireRecordingTask = task({
	id: "acquire.recording",
	queue: { name: "acquire", concurrencyLimit: 2 },
	maxDuration: 3600,
	run: async (payload: AcquirePayload) => {
		const job = await loadAcquireJob(payload.recordingId);
		if (!job) return { status: "gone" as const };
		const [providers, acoustid] = await Promise.all([
			configuredProviders(),
			getCredentials("acoustid"),
		]);
		const lookup = acoustid ? createAcoustidClient(acoustid.apiKey) : null;
		const placeOptions = {
			musicDir: env.LYTERION_MUSIC_DIR,
			librarySubdir: env.LYTERION_LIBRARY_SUBDIR,
			python: env.LYTERION_PYTHON,
			maxBitDepth: env.LYTERION_MAX_BIT_DEPTH,
			maxSampleRateHz: env.LYTERION_MAX_SAMPLE_RATE_HZ,
		};

		await setRecordingStatus(payload.recordingId, "searching");
		const outcome = await acquireRecording(job.target, {
			providers,
			stagingDir: env.LYTERION_STAGING_DIR,
			guard: () =>
				diskGuard({
					musicDir: env.LYTERION_MUSIC_DIR,
					stagingDir: env.LYTERION_STAGING_DIR,
					stagingBudgetGb: env.LYTERION_STAGING_BUDGET_GB,
					minFreeGb: env.LYTERION_MIN_FREE_GB,
				}),
			verify: (path, candidate) =>
				verifyFile(
					path,
					{ durationMs: job.target.durationMs, mbRecordingIds: [], candidate },
					lookup ? { lookupFingerprint: (fp) => lookup.lookup(fp) } : {},
				),
			place: createPlacer(job, placeOptions),
		});

		if (outcome.status === "paused") {
			logger.warn("acquire paused", { reason: outcome.reason });
			await setRecordingStatus(payload.recordingId, job.status);
			await acquireRecordingTask.trigger(payload, { delay: PAUSE_DELAY });
			return { status: "paused" as const, reason: outcome.reason };
		}

		await recordOutcome(job, outcome);
		const progress = await incrementStage(
			payload.runId,
			ACQUIRE_STAGE,
			outcome.status === "placed" ? { done: 1 } : { failed: 1 },
		);
		if (stageComplete(progress) && (await claimStage(payload.runId, "finish")))
			await finishRun(payload.runId, "done");
		logger.info("acquire done", {
			status: outcome.status,
			tried: outcome.attempts.length,
			...(outcome.status === "placed"
				? { path: outcome.path }
				: { errors: outcome.errors }),
		});
		return { status: outcome.status };
	},
});
