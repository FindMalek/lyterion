import { z } from "zod";

export const authModule = {
	server: {
		LYTERION_BETTER_AUTH_SECRET: z.string().min(32),
		LYTERION_SPOTIFY_CLIENT_ID: z.string().min(1),
		LYTERION_SPOTIFY_CLIENT_SECRET: z.string().min(1),
		LYTERION_AUTH_PRODUCTION_URL: z.url().optional(),
		LYTERION_COOKIE_DOMAIN: z.string().min(1).optional(),
	},
} as const;
