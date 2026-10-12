import { z } from "zod";

export const urlsModule = {
	client: {
		NEXT_PUBLIC_LYTERION_DASHBOARD_URL: z.url().optional(),
	},
} as const;
