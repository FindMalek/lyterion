import { timingSafeEqual } from "node:crypto";

import { playerSummary } from "@lyterion/common/library/player-summary";
import { env } from "@lyterion/env/server";
import { ORPCError } from "@orpc/server";

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
};
