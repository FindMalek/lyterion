import { z } from "zod";

export const triggerModule = {
	server: {
		LYTERION_TRIGGER_API_URL: z.url().optional(),
		LYTERION_TRIGGER_SECRET_KEY: z.string().optional(),
		LYTERION_TRIGGER_PROJECT_REF: z.string().optional(),
	},
} as const;
