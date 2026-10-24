import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../procedures";
import { connectionsRouter } from "./connections";
import { libraryRouter } from "./library";
import { onboardingRouter } from "./onboarding";
import { playerRouter } from "./player";
import { reviewRouter } from "./review";
import { runsRouter } from "./runs";

export const appRouter = {
	onboarding: onboardingRouter,
	connections: connectionsRouter,
	runs: runsRouter,
	review: reviewRouter,
	library: libraryRouter,
	player: playerRouter,
	health: publicProcedure.handler(() => ({ ok: true as const })),
	me: protectedProcedure.handler(({ context }) => ({
		id: context.session.user.id,
		name: context.session.user.name,
		image: context.session.user.image ?? null,
	})),
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<AppRouter>;
