import { countUsers, spotifyRedirectUri } from "@lyterion/core";
import { env } from "@lyterion/env/server";

import { rawCredentials, saveCredentials } from "../credentials/store";
import { testSpotifyApp } from "../health/connections";
import { checkSetupCode, ensureSetupCode } from "./setup-code";

export { checkSetupCode, ensureSetupCode } from "./setup-code";

export class OnboardingError extends Error {
	constructor(
		readonly code: "FORBIDDEN" | "UNAUTHORIZED" | "BAD_REQUEST",
		message: string,
	) {
		super(message);
	}
}

export async function onboardingStatus() {
	const [users, spotify] = await Promise.all([
		countUsers(),
		rawCredentials("spotify"),
	]);
	return {
		hasOwner: users > 0,
		spotifyApp: spotify.source,
		redirectUri: spotifyRedirectUri(
			env.LYTERION_AUTH_PRODUCTION_URL ?? env.NEXT_PUBLIC_LYTERION_API_URL,
		),
	};
}

async function guard(code: string) {
	if ((await countUsers()) > 0)
		throw new OnboardingError(
			"FORBIDDEN",
			"this instance already has an owner, change keys from connections",
		);
	await ensureSetupCode();
	if (!(await checkSetupCode(code)))
		throw new OnboardingError(
			"UNAUTHORIZED",
			"wrong setup code, it is printed in the api logs",
		);
}

export async function verifySetupCode(code: string): Promise<void> {
	await guard(code);
}

// Validated with a client credentials token before it is stored, so a typo never reaches the sign-in screen.
export async function saveSpotifyApp(
	code: string,
	app: { clientId: string; clientSecret: string },
): Promise<void> {
	await guard(code);
	const clientId = app.clientId.trim();
	const clientSecret = app.clientSecret.trim();
	const result = await testSpotifyApp({ clientId, clientSecret });
	if (!result.ok)
		throw new OnboardingError(
			"BAD_REQUEST",
			result.detail ?? "spotify refused the app",
		);
	await saveCredentials("spotify", { clientId, clientSecret });
}
