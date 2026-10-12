import * as schema from "@lyterion/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export type AuthEnvConfig = {
	LYTERION_BETTER_AUTH_SECRET: string;
	LYTERION_SPOTIFY_CLIENT_ID: string;
	LYTERION_SPOTIFY_CLIENT_SECRET: string;
	NEXT_PUBLIC_LYTERION_API_URL: string;
	NEXT_PUBLIC_LYTERION_DASHBOARD_URL?: string;
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
	return betterAuth({
		baseURL: envConfig.NEXT_PUBLIC_LYTERION_API_URL,
		basePath: "/api/auth",
		secret: envConfig.LYTERION_BETTER_AUTH_SECRET,
		advanced: { cookiePrefix: "lyterion" },
		database: drizzleAdapter(database, { provider: "pg", schema }),
		trustedOrigins: [
			envConfig.NEXT_PUBLIC_LYTERION_API_URL,
			envConfig.NEXT_PUBLIC_LYTERION_DASHBOARD_URL,
		].filter((origin): origin is string => origin !== undefined),
		socialProviders: {
			spotify: {
				clientId: envConfig.LYTERION_SPOTIFY_CLIENT_ID,
				clientSecret: envConfig.LYTERION_SPOTIFY_CLIENT_SECRET,
				redirectURI: `${envConfig.NEXT_PUBLIC_LYTERION_API_URL}/api/auth/callback/spotify`,
				scope: SPOTIFY_SCOPES,
			},
		},
		// nextCookies must be last: it flushes the cookie jar into real Set-Cookie headers.
		plugins: [nextCookies()],
	});
}

export type Auth = ReturnType<typeof createAuth>;
