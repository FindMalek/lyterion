import { z } from "zod";

export const navidromeModule = {
	server: {
		LYTERION_NAVIDROME_URL: z.url().optional(),
		LYTERION_NAVIDROME_USER: z.string().min(1).optional(),
		LYTERION_NAVIDROME_PASSWORD: z.string().min(1).optional(),
	},
} as const;
