import { StartRunError, triggerTask } from "@lyterion/common/pipeline/start";
import {
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
			try {
				await triggerTask("review.resolve", input);
			} catch (err) {
				if (err instanceof StartRunError)
					throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
				throw err;
			}
			return { queued: true as const };
		}),
	skip: protectedProcedure
		.input(z.object({ reviewId: z.number().int() }))
		.handler(async ({ input }) => {
			await skipRecording(input.reviewId);
			return { ok: true as const };
		}),
};
