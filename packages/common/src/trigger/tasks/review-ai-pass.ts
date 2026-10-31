import { logger, task } from "@trigger.dev/sdk";

import { groqPickAsk } from "../../acquire/llm";
import { type PickAsk, pickCandidate } from "../../acquire/picker";
import { getCredentials } from "../../credentials/store";
import type { AudioFormat, Candidate, ProviderId } from "../../providers/types";
import { openReviews, stagedCandidate } from "../../review/persist";
import { acquireQueue } from "./acquire-recording";
import { reviewResolveTask } from "./review-resolve";

export type AiPassPayload = { limit?: number; dryRun?: boolean };

// #126: the large model over what the preview check left open. A pick above the picker's accept line goes through review.resolve like an owner pick.
export const reviewAiPassTask = task({
	id: "review.ai-pass",
	queue: acquireQueue,
	maxDuration: 6 * 3600,
	run: async ({ limit, dryRun = true }: AiPassPayload = {}) => {
		const groq = await getCredentials("groq");
		if (!groq) return { skipped: "groq is not connected" };
		const base = groqPickAsk(groq.apiKey);
		const ask: PickAsk = (_model, prompt) => base("candidatePickHard", prompt);

		const reviews = await openReviews();
		const suggestions: {
			reviewId: number;
			candidateId: number;
			confidence: number;
			reason: string;
		}[] = [];
		let checked = 0;
		for (const review of reviews) {
			if (limit && checked >= limit) break;
			if (review.candidates.length === 0) continue;
			checked++;
			const rows = (
				await Promise.all(review.candidates.map((c) => stagedCandidate(c.id)))
			).flatMap((r) => r ?? []);
			const candidates: Candidate[] = rows.map((row) => ({
				providerId: row.providerId as ProviderId,
				ref: row.ref,
				format: row.format as AudioFormat,
				bitrateKbps: row.bitrateKbps ?? undefined,
				bitDepth: row.bitDepth ?? undefined,
				sampleRateHz: row.sampleRateHz ?? undefined,
				durationMs: row.durationMs ?? undefined,
				isrcMatch: row.isrcMatch,
				matchConfidence: row.matchConfidence,
			}));
			const decision = await pickCandidate(
				{
					recordingId: review.recordingId,
					isrcs: review.isrcs,
					title: review.title,
					artists: review.artists,
					album: review.album,
					durationMs: review.durationMs,
					spotifyTrackId: null,
				},
				candidates,
				ask,
			).catch((err: unknown) => {
				logger.warn("ai pass failed", {
					reviewId: review.id,
					error: String(err),
				});
				return null;
			});
			const picked = decision ? rows[decision.index] : null;
			if (!decision || !picked) continue;
			suggestions.push({
				reviewId: review.id,
				candidateId: picked.id,
				confidence: decision.confidence,
				reason: decision.reason,
			});
			if (!dryRun)
				await reviewResolveTask.trigger({
					reviewId: review.id,
					candidateId: picked.id,
				});
		}
		logger.info("review ai pass", {
			checked,
			suggested: suggestions.length,
			dryRun,
			suggestions,
		});
		return { checked, suggestions, dryRun };
	},
});
