import * as schema from "@lyterion/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { oAuthProxy } from "better-auth/plugins";

export type AuthEnvConfig = {
	LYTERION_BETTER_AUTH_SECRET: string;
	LYTERION_SPOTIFY_CLIENT_ID: string;
	LYTERION_SPOTIFY_CLIENT_SECRET: string;
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

export function createAuth(
	database: Parameters<typeof drizzleAdapter>[0],
	envConfig: AuthEnvConfig,
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
		trustedOrigins: [
			apiUrl,
			productionApiUrl,
			envConfig.NEXT_PUBLIC_LYTERION_DASHBOARD_URL,
		].filter((origin): origin is string => origin !== undefined),
		socialProviders: {
			spotify: {
				clientId: envConfig.LYTERION_SPOTIFY_CLIENT_ID,
				clientSecret: envConfig.LYTERION_SPOTIFY_CLIENT_SECRET,
				redirectURI: `${productionApiUrl}/api/auth/callback/spotify`,
				scope: SPOTIFY_SCOPES,
			},
		},
		// nextCookies must be last: it flushes the cookie jar into real Set-Cookie headers.
		plugins: [
			oAuthProxy({ productionURL: productionApiUrl, currentURL: apiUrl }),
			nextCookies(),
		],
	});
}

export type Auth = ReturnType<typeof createAuth>;
