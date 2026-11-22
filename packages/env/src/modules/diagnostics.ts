import { z } from "zod";

export const diagnosticsModule = {
	server: {
		LYTERION_DIAGNOSTICS: z.enum(["on", "off"]).default("on"),
		LYTERION_GLITCHTIP_DSN: z.url().optional(),
		LYTERION_O2_URL: z.url().optional(),
		LYTERION_O2_ORG: z.string().min(1).default("default"),
		LYTERION_O2_STREAM: z.string().min(1).default("lyterion"),
		LYTERION_O2_USER: z.string().min(1).optional(),
		LYTERION_O2_PASSWORD: z.string().min(1).optional(),
	},
} as const;
