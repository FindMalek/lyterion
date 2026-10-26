import { StartRunError } from "@lyterion/common/pipeline/start";
import { addWish } from "@lyterion/common/wishlist/add";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";

export const wishlistRouter = {
	add: protectedProcedure
		.input(z.object({ input: z.string().trim().min(2).max(300) }))
		.handler(async ({ input }) => {
			try {
				const { meta } = await addWish(input.input);
				return meta;
			} catch (err) {
				if (err instanceof StartRunError)
					throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
				throw new ORPCError("BAD_REQUEST", {
					message: err instanceof Error ? err.message : String(err),
				});
			}
		}),
};
