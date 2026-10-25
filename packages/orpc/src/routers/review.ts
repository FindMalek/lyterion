import {
	StartRunError,
	triggerTask,
	triggerTasks,
} from "@lyterion/common/pipeline/start";
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
		.input(z.object({ reviewIds: z.array(z.number().int()).min(1).max(500) }))
		.handler(async ({ input }) => {
			const wanted = new Set(input.reviewIds);
			const items = (await openReviews()).filter((item) => wanted.has(item.id));
			const claimed: { reviewId: number; candidateId: number }[] = [];
			const failed: number[] = [];
			// Claimed 25 at a time: each is two small queries, and a long sequential loop would outlast the request.
			for (let i = 0; i < items.length; i += 25)
				await Promise.all(
					items.slice(i, i + 25).map(async (item) => {
						const best = bestCandidate(item.candidates, item.durationMs);
						if (best && (await markPicking(item.id, best.id)))
							claimed.push({ reviewId: item.id, candidateId: best.id });
						else failed.push(item.id);
					}),
				);
			if (claimed.length)
				try {
					await triggerTasks("review.resolve", claimed, { priority: 3600 });
				} catch (err) {
					const reason = err instanceof Error ? err.message : String(err);
					await Promise.all(
						claimed.map((pick) => markPickFailed(pick.reviewId, reason)),
					);
					throw new ORPCError("PRECONDITION_FAILED", { message: reason });
				}
			return { queued: claimed.length, failed };
		}),
	skip: protectedProcedure
		.input(z.object({ reviewId: z.number().int() }))
		.handler(async ({ input }) => {
			await skipRecording(input.reviewId);
			return { ok: true as const };
		}),
};
