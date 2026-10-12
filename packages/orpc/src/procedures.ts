import { ORPCError } from "@orpc/server";

import { rateLimitMiddleware } from "./middleware/rate-limit";
import { o } from "./os";

export { o };

export const publicProcedure = o.use(rateLimitMiddleware);

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireAuth);
