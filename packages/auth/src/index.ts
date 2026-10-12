import * as schema from "@lyterion/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { oAuthProxy } from "better-auth/plugins";

import { ownerOnlyGate } from "./owner-gate";

export { ownerOnlyGate } from "./owner-gate";

export type SpotifyApp = { clientId: string; clientSecret: string };

export type AuthEnvConfig = {
	LYTERION_BETTER_AUTH_SECRET: string;
	// Absent until onboarding saves the owner's Spotify app (#83); sessions still resolve without it.
	spotify: SpotifyApp | null;
	NEXT_PUBLIC_LYTERION_API_URL: string;
	NEXT_PUBLIC_LYTERION_DASHBOARD_URL?: string;
	LYTERION_AUTH_PRODUCTION_URL?: string;
	LYTERION_COOKIE_DOMAIN?: string;
};

const SPOTIFY_SCOPES = [
	"user-read-email",
	"user-read-private",
	"user-library-read",
	"user-follow-read",
	"playlist-read-private",
	"playlist-read-collaborative",
];

export function spotifyRedirectUri(apiUrl: string): string {
	return `${apiUrl}/api/auth/callback/spotify`;
}

export function createAuth(
	database: Parameters<typeof drizzleAdapter>[0],
	envConfig: AuthEnvConfig,
	countUsers: () => Promise<number>,
) {
	const apiUrl = envConfig.NEXT_PUBLIC_LYTERION_API_URL;
	// Spotify only accepts exact redirect URIs, so previews route the callback through production (D-036).
	const productionApiUrl = envConfig.LYTERION_AUTH_PRODUCTION_URL ?? apiUrl;

	return betterAuth({
		baseURL: apiUrl,
		basePath: "/api/auth",
		secret: envConfig.LYTERION_BETTER_AUTH_SECRET,
		advanced: {
			cookiePrefix: "lyterion",
			...(envConfig.LYTERION_COOKIE_DOMAIN
				? {
						crossSubDomainCookies: {
							enabled: true,
							domain: envConfig.LYTERION_COOKIE_DOMAIN,
						},
					}
				: {}),
		},
		database: drizzleAdapter(database, { provider: "pg", schema }),
		databaseHooks: {
			user: { create: { before: ownerOnlyGate(countUsers) } },
		},
		trustedOrigins: [
			apiUrl,
			productionApiUrl,
			envConfig.NEXT_PUBLIC_LYTERION_DASHBOARD_URL,
		].filter((origin): origin is string => origin !== undefined),
		socialProviders: envConfig.spotify
			? {
					spotify: {
						...envConfig.spotify,
						redirectURI: spotifyRedirectUri(productionApiUrl),
						scope: SPOTIFY_SCOPES,
					},
				}
			: {},
		// nextCookies must be last: it flushes the cookie jar into real Set-Cookie headers.
		plugins: [
			oAuthProxy({ productionURL: productionApiUrl, currentURL: apiUrl }),
			nextCookies(),
		],
	});
}

export type Auth = ReturnType<typeof createAuth>;
