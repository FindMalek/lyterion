import { z } from "zod";

export const authModule = {
	server: {
		LYTERION_BETTER_AUTH_SECRET: z.string().min(32),
		// Encrypts dashboard-entered credentials (#83); derived from the auth secret when unset.
		LYTERION_ENCRYPTION_KEY: z.string().min(32).optional(),
		// Optional: onboarding stores the Spotify app in the database instead (#83).
		LYTERION_SPOTIFY_CLIENT_ID: z.string().min(1).optional(),
		LYTERION_SPOTIFY_CLIENT_SECRET: z.string().min(1).optional(),
		LYTERION_AUTH_PRODUCTION_URL: z.url().optional(),
		LYTERION_COOKIE_DOMAIN: z.string().min(1).optional(),
		// keep-player reads the Spotify sync state with this (sent as x-lyterion-token); unset turns that API off.
		LYTERION_PLAYER_TOKEN: z.string().min(24).optional(),
	},
} as const;
