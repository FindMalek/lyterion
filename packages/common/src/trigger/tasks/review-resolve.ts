import { access } from "node:fs/promises";

import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";

import type { AcquireOutcome } from "../../acquire/acquire";
import {
	createPlacer,
	loadAcquireJob,
	recordOutcome,
} from "../../acquire/persist";
import { configuredProviders } from "../../credentials/providers";
import { albumGainAfterPlace } from "../../library/album-gain";
import type { AudioFormat, Candidate, ProviderId } from "../../providers/types";
import {
	discardStaged,
	resolveReview,
	reviewForRecording,
	stagedCandidate,
} from "../../review/persist";
import { verifyFile } from "../../verify/index";
import { requestScan } from "./navidrome-scan";

export type ReviewPickPayload = { reviewId: number; candidateId: number };

async function exists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

// The owner's pick counts as full confidence; the file still has to decode and match the duration.
export const reviewResolveTask = task({
	id: "review.resolve",
	queue: { name: "acquire", concurrencyLimit: 2 },
	maxDuration: 3600,
	run: async ({ reviewId, candidateId }: ReviewPickPayload) => {
		const review = await reviewForRecording(reviewId);
		const row = await stagedCandidate(candidateId);
		if (!review || !row || row.recordingId !== review.recordingId)
			throw new Error("review or candidate not found");
		const job = await loadAcquireJob(review.recordingId);
		if (!job) throw new Error("recording gone");
		const picked: Candidate = {
			providerId: row.providerId as ProviderId,
			ref: row.ref,
			format: row.format as AudioFormat,
			bitrateKbps: row.bitrateKbps ?? undefined,
			bitDepth: row.bitDepth ?? undefined,
			sampleRateHz: row.sampleRateHz ?? undefined,
			durationMs: row.durationMs ?? undefined,
			isrcMatch: row.isrcMatch,
			matchConfidence: 1,
		};

		let file =
			row.stagedPath && (await exists(row.stagedPath)) ? row.stagedPath : null;
		if (!file) {
			const provider = (await configuredProviders()).find(
				(p) => p.id === picked.providerId,
			);
			if (!provider)
				throw new Error(`${picked.providerId} is not configured anymore`);
			file = (await provider.fetch(picked, env.LYTERION_STAGING_DIR)).path;
		}
		const verify = await verifyFile(file, {
			durationMs: job.target.durationMs,
			mbRecordingIds: [],
			candidate: picked,
		});
		if (!verify.ok)
			throw new Error(`picked file failed verification: ${verify.reason}`);
		const path = await createPlacer(job, {
			musicDir: env.LYTERION_MUSIC_DIR,
			librarySubdir: env.LYTERION_LIBRARY_SUBDIR,
			python: env.LYTERION_PYTHON,
			maxBitDepth: env.LYTERION_MAX_BIT_DEPTH,
			maxSampleRateHz: env.LYTERION_MAX_SAMPLE_RATE_HZ,
		})(file, picked, verify);
		const outcome: AcquireOutcome = {
			status: "placed",
			path,
			chosen: picked,
			verify: {
				...verify,
				upgradeReason: verify.upgradeReason ?? "unverified_match",
			},
			attempts: [
				{
					candidate: { ...picked, matchConfidence: row.matchConfidence },
					rank: row.rank,
					state: "chosen",
				},
			],
		};
		await recordOutcome(job, outcome);
		await resolveReview(reviewId, `picked:${candidateId}`);
		await discardStaged(review.recordingId);
		await albumGainAfterPlace(job.placement.releaseId, env.LYTERION_PYTHON);
		await requestScan();
		logger.info("review resolved", { reviewId, candidateId, path });
		return { path };
	},
});
