import { z } from "zod";

export const aiModule = {
	server: {
		LYTERION_GROQ_API_KEY: z.string().min(1).optional(),
	},
} as const;
