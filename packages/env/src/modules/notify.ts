import { z } from "zod";

export const notifyModule = {
	server: {
		LYTERION_NTFY_URL: z.url().optional(),
		LYTERION_NTFY_TOPIC: z.string().min(1).default("lyterion"),
		LYTERION_NTFY_TOKEN: z.string().min(1).optional(),
	},
} as const;
