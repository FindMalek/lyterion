import { db } from "@lyterion/db";
import { migrationRun } from "@lyterion/db/schema/run";
import { env } from "@lyterion/env/server";
import { logger, queue, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import { acquireRecording } from "../../acquire/acquire";
import { diskGuard } from "../../acquire/disk";
import { dispatchAcquire } from "../../acquire/dispatch";
import { groqPickAsk } from "../../acquire/llm";
import {
	createPlacer,
	loadAcquireJob,
	moveToReview,
	recordOutcome,
	setRecordingStatus,
} from "../../acquire/persist";
import { failIfInFlight, runIsLive } from "../../acquire/queue";
import { configuredProviders } from "../../credentials/providers";
import { getCredentials } from "../../credentials/store";
import { albumGainAfterPlace } from "../../library/album-gain";
import {
	notifyOwner,
	notifyReviewNeeded,
	runSummary,
} from "../../notify/owner";
import {
	claimStage,
	finishRun,
	incrementStage,
	stageComplete,
} from "../../pipeline/advance";
import type { Provider } from "../../providers/types";
import { createAcoustidClient } from "../../verify/acoustid";
import { verifyFile } from "../../verify/index";
import { WISHLIST_RUN_KIND } from "../../wishlist/custom";
import { lidarrRequestTask } from "./lidarr-request";
import { navidromeScanTask, requestScan } from "./navidrome-scan";

export const ACQUIRE_STAGE = "acquire";
const PAUSE_DELAY = "10m";

export type AcquirePayload = { runId: number; recordingId: string };

// Shared by every task that downloads and verifies (acquire, release, review, upgrade): half of the-keep's 6 cores, so the rest stays responsive (#157).
export const ACQUIRE_CONCURRENCY = 4;
export const acquireQueue: ReturnType<typeof queue> = queue({
	name: "acquire",
	concurrencyLimit: ACQUIRE_CONCURRENCY,
});

/** One recording, start to stage counters; `providers` lets acquire.release hand in its album search results. */
export async function acquireOne(
	payload: AcquirePayload,
	providersOverride?: Provider[],
) {
	if (!(await runIsLive(payload.runId))) return { status: "stale" as const };
	const job = await loadAcquireJob(payload.recordingId);
	if (!job) return { status: "gone" as const };
	const [providers, acoustid, groq] = await Promise.all([
		providersOverride ?? configuredProviders(),
		getCredentials("acoustid"),
		getCredentials("groq"),
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
		pick: groq ? groqPickAsk(groq.apiKey) : undefined,
		keepForReview: (path) =>
			moveToReview(env.LYTERION_STAGING_DIR, payload.recordingId, path),
	});

	if (outcome.status === "paused") {
		logger.warn("acquire paused", { reason: outcome.reason });
		await setRecordingStatus(payload.recordingId, job.status);
		await acquireRecordingTask.trigger(payload, { delay: PAUSE_DELAY });
		return { status: "paused" as const, reason: outcome.reason };
	}

	await recordOutcome(job, outcome);
	if (outcome.status === "placed") {
		const albumGain = await albumGainAfterPlace(
			job.placement.releaseId,
			env.LYTERION_PYTHON,
		);
		if (albumGain?.status === "written") logger.info("album gain", albumGain);
		await requestScan();
	}
	if (outcome.status === "review")
		await notifyReviewNeeded().catch(() => false);
	await countAndContinue(payload.runId, outcome.status === "placed");
	logger.info("acquire done", {
		status: outcome.status,
		tried: outcome.attempts.length,
		...(outcome.status === "placed"
			? { path: outcome.path }
			: { errors: outcome.errors }),
	});
	return { status: outcome.status };
}

/** Counts the track, tops the window up, and closes the run when it was the last one (D-014). */
async function countAndContinue(runId: number, placed: boolean) {
	const progress = await incrementStage(
		runId,
		ACQUIRE_STAGE,
		placed ? { done: 1 } : { failed: 1 },
	);
	await dispatchAcquire(runId);
	if (stageComplete(progress)) await closeRun(runId);
}

async function isWishlistRun(runId: number) {
	const [run] = await db
		.select({ options: migrationRun.options })
		.from(migrationRun)
		.where(eq(migrationRun.id, runId));
	return run?.options.kind === WISHLIST_RUN_KIND;
}

/** Exactly one caller closes the run: scans, asks Lidarr for the rest and tells the owner. */
export async function closeRun(runId: number) {
	if (await claimStage(runId, "finish")) {
		await finishRun(runId, "done");
		await navidromeScanTask.trigger({ force: true });
		// A wishlist track is one song, not a library to complete.
		if (!(await isWishlistRun(runId)))
			await lidarrRequestTask.trigger(undefined);
		const summary = await runSummary();
		await notifyOwner({
			kind: "run_finished",
			summary: summary.text,
			failed: summary.failed,
		}).catch(() => undefined);
	}
}

/** A crash on one track counts as a failure for that track, so the run keeps its window full instead of stalling. */
export async function acquireOneSafely(
	payload: AcquirePayload,
	providersOverride?: Provider[],
) {
	try {
		return await acquireOne(payload, providersOverride);
	} catch (err) {
		if (
			(await failIfInFlight(payload.recordingId)) &&
			(await runIsLive(payload.runId))
		)
			await countAndContinue(payload.runId, false);
		throw err;
	}
}

// One recording per run (docs/pipeline.md): the last one to finish closes the migration run (D-014).
export const acquireRecordingTask = task({
	id: "acquire.recording",
	queue: acquireQueue,
	maxDuration: 3600,
	run: (payload: AcquirePayload) => acquireOneSafely(payload),
});
