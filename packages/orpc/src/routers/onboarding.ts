import {
	OnboardingError,
	onboardingStatus,
	saveSpotifyApp,
	verifySetupCode,
} from "@lyterion/common/onboarding";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { publicProcedure } from "../procedures";

const code = z.string().trim().min(1).max(64);

async function run<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof OnboardingError)
			throw new ORPCError(err.code, { message: err.message });
		throw err;
	}
}

// Public on purpose: there is no owner to sign in yet. Every write checks the setup code from the api logs (#83).
export const onboardingRouter = {
	status: publicProcedure.handler(() => onboardingStatus()),
	verifyCode: publicProcedure.input(z.object({ code })).handler(({ input }) =>
		run(async () => {
			await verifySetupCode(input.code);
			return { ok: true as const };
		}),
	),
	saveSpotifyApp: publicProcedure
		.input(
			z.object({
				code,
				clientId: z.string().trim().min(1).max(128),
				clientSecret: z.string().trim().min(1).max(128),
			}),
		)
		.handler(({ input }) =>
			run(async () => {
				await saveSpotifyApp(input.code, input);
				return { ok: true as const };
			}),
		),
};
