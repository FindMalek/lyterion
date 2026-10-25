import { StartRunError, triggerTask } from "@lyterion/common/pipeline/start";
import {
	bestCandidate,
	markPickFailed,
	markPicking,
	openReviewCount,
	openReviews,
	reviewForRecording,
	skipRecording,
	stagedCandidate,
} from "@lyterion/common/review";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";

export const reviewRouter = {
	list: protectedProcedure.handler(() => openReviews()),
	count: protectedProcedure.handler(() => openReviewCount()),
	pick: protectedProcedure
		.input(
			z.object({ reviewId: z.number().int(), candidateId: z.number().int() }),
		)
		.handler(async ({ input }) => {
			const [review, row] = await Promise.all([
				reviewForRecording(input.reviewId),
				stagedCandidate(input.candidateId),
			]);
			if (
				!review ||
				review.resolvedAt ||
				!row ||
				row.recordingId !== review.recordingId
			)
				throw new ORPCError("NOT_FOUND", {
					message: "review item or candidate not found",
				});
			// Hidden from the queue at once; the task restores it with the reason if placing fails.
			if (!(await markPicking(input.reviewId, input.candidateId)))
				throw new ORPCError("CONFLICT", {
					message: "this track is already being placed",
				});
			try {
				// Ahead of the bulk acquire backlog that shares the queue: an hour's worth of queue time.
				await triggerTask("review.resolve", input, { priority: 3600 });
			} catch (err) {
				await markPickFailed(
					input.reviewId,
					err instanceof Error ? err.message : String(err),
				);
				if (err instanceof StartRunError)
					throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
				throw err;
			}
			return { queued: true as const };
		}),
	/** The best candidate for each of these reviews, queued like a single pick; answers how many went and which didn't. */
	pickMany: protectedProcedure
		.input(z.object({ reviewIds: z.array(z.number().int()).min(1).max(1000) }))
		.handler(async ({ input }) => {
			const wanted = new Set(input.reviewIds);
			const items = (await openReviews()).filter((item) => wanted.has(item.id));
			let queued = 0;
			const failed: number[] = [];
			for (const item of items) {
				const best = bestCandidate(item.candidates, item.durationMs);
				if (!best || !(await markPicking(item.id, best.id))) {
					failed.push(item.id);
					continue;
				}
				try {
					await triggerTask(
						"review.resolve",
						{ reviewId: item.id, candidateId: best.id },
						{ priority: 3600 },
					);
					queued++;
				} catch (err) {
					await markPickFailed(
						item.id,
						err instanceof Error ? err.message : String(err),
					);
					failed.push(item.id);
				}
			}
			return { queued, failed };
		}),
	skip: protectedProcedure
		.input(z.object({ reviewId: z.number().int() }))
		.handler(async ({ input }) => {
			await skipRecording(input.reviewId);
			return { ok: true as const };
		}),
};
