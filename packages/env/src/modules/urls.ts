import { z } from "zod";

export const urlsModule = {
	server: {
		// The public api host is tailnet-only, so the dashboard's server reaches it over dokploy-network.
		LYTERION_API_INTERNAL_URL: z.url().optional(),
	},
	client: {
		NEXT_PUBLIC_LYTERION_DASHBOARD_URL: z.url().optional(),
	},
} as const;
