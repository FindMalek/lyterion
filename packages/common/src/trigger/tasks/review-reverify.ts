import { access } from "node:fs/promises";

import { logger, task } from "@trigger.dev/sdk";

import { openReviews, stagedCandidate } from "../../review/persist";
import { matchesDeezerPreview } from "../../verify/preview";
import { reviewResolveTask } from "./review-resolve";

export type ReverifyPayload = { limit?: number; dryRun?: boolean };

async function exists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

// Staged near misses (#124): the first candidate that matches the Deezer preview of the isrc resolves its review through the owner pick path.
export const reviewReverifyTask = task({
	id: "review.reverify",
	maxDuration: 6 * 3600,
	run: async ({ limit, dryRun = true }: ReverifyPayload = {}) => {
		const reviews = await openReviews();
		let checked = 0;
		const matched: { reviewId: number; candidateId: number }[] = [];
		for (const review of reviews) {
			if (limit && checked >= limit) break;
			checked++;
			for (const c of review.candidates) {
				if (!c.previewable) continue;
				const staged = await stagedCandidate(c.id);
				if (!staged?.stagedPath || !(await exists(staged.stagedPath))) continue;
				const ok = await matchesDeezerPreview(staged.stagedPath, {
					isrc: review.isrcs[0],
					title: review.title,
					artists: review.artists,
					durationMs: review.durationMs,
				}).catch(() => false);
				if (!ok) continue;
				matched.push({ reviewId: review.id, candidateId: c.id });
				if (!dryRun)
					await reviewResolveTask.trigger({
						reviewId: review.id,
						candidateId: c.id,
					});
				break;
			}
		}
		logger.info("review reverify", {
			checked,
			matched: matched.length,
			dryRun,
		});
		return { checked, matched, dryRun };
	},
});
