import { ORPCError } from "@orpc/server";

import { o } from "../os";
import { rateLimiters } from "../utils/rate-limiter";

/** Strict limiter for anonymous callers, standard once signed in. */
export const rateLimitMiddleware = o.middleware(async ({ context, next }) => {
	const authUserId = context.session?.user?.id;
	const isAuthenticated = !!authUserId;
	const limiter = isAuthenticated ? rateLimiters.standard : rateLimiters.strict;
	const identifier = limiter.getIdentifier(context.headers, authUserId);

	const result = limiter.check(identifier);
	if (!result.success) {
		throw new ORPCError("TOO_MANY_REQUESTS", {
			message: `Rate limit exceeded. Please try again in ${result.retryAfter}s.`,
		});
	}

	return next();
});
