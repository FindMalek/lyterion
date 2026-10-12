import { createAuthClient } from "better-auth/react";
import { env } from "@/lib/env";

// Sessions last 7 days and re-validate on navigation, refetch on focus is noise.
export const authClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_LYTERION_API_URL,
	sessionOptions: {
		refetchOnWindowFocus: false,
	},
});
