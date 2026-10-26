import { timingSafeEqual } from "node:crypto";
import { playerSummary } from "@lyterion/common/library/player-summary";
import { StartRunError } from "@lyterion/common/pipeline/start";
import {
	addWish,
	resolveWishInTask,
	wishState,
} from "@lyterion/common/wishlist/add";
import { env } from "@lyterion/env/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { publicProcedure } from "../procedures";

/** keep-player's own token (LYTERION_PLAYER_TOKEN), not a dashboard session: it calls server to server. */
const playerProcedure = publicProcedure.use(({ context, next }) => {
	const expected = env.LYTERION_PLAYER_TOKEN;
	if (!expected) throw new ORPCError("NOT_FOUND");
	const given = Buffer.from(context.headers.get("x-lyterion-token") ?? "");
	const want = Buffer.from(expected);
	if (given.length !== want.length || !timingSafeEqual(given, want))
		throw new ORPCError("UNAUTHORIZED");
	return next();
});

export const playerRouter = {
	summary: playerProcedure
		.route({ method: "GET", path: "/player/summary" })
		.handler(() => playerSummary()),
	// What a pasted link or name is, before anything is added (the preview card).
	wishlistPreview: playerProcedure
		.route({ method: "POST", path: "/player/wishlist/preview" })
		.input(z.object({ input: z.string().trim().min(2).max(300) }))
		.handler(async ({ input }) => {
			try {
				return await resolveWishInTask(input.input);
			} catch (err) {
				throw new ORPCError("BAD_REQUEST", {
					message: err instanceof Error ? err.message : String(err),
				});
			}
		}),
	wishlistAdd: playerProcedure
		.route({ method: "POST", path: "/player/wishlist" })
		.input(z.object({ input: z.string().trim().min(2).max(300) }))
		.handler(async ({ input }) => {
			try {
				const { recordingId, meta } = await addWish(input.input);
				return { recordingId, meta };
			} catch (err) {
				if (err instanceof StartRunError)
					throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
				throw new ORPCError("BAD_REQUEST", {
					message: err instanceof Error ? err.message : String(err),
				});
			}
		}),
	wishlistStatus: playerProcedure
		.route({ method: "POST", path: "/player/wishlist/status" })
		.input(z.object({ recordingId: z.string().min(1).max(100) }))
		.handler(({ input }) => wishState(input.recordingId)),
};
