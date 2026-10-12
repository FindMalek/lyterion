import { z } from "zod";

/**
 * Database module - defines DATABASE_URL schema
 */
export const dbModule = {
	server: {
		LYTERION_DATABASE_URL: z.url(),
	},
} as const;
