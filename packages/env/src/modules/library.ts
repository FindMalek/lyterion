import { z } from "zod";

// Paths are as seen inside the containers, see docs/architecture.md.
export const libraryModule = {
	server: {
		LYTERION_MUSIC_DIR: z.string().min(1).default("/music"),
		LYTERION_LIBRARY_SUBDIR: z.string().min(1).default("lyterion"),
		LYTERION_STAGING_DIR: z.string().min(1).default("/staging"),
		LYTERION_STAGING_BUDGET_GB: z.coerce.number().positive().default(50),
		LYTERION_MIN_FREE_GB: z.coerce.number().positive().default(100),
		LYTERION_MAX_BIT_DEPTH: z.coerce.number().int().default(16),
		LYTERION_MAX_SAMPLE_RATE_HZ: z.coerce.number().int().default(44_100),
		LYTERION_PYTHON: z.string().min(1).default("python3"),
	},
} as const;
