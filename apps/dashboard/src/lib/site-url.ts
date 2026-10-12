import { env } from "@lyterion/env/dashboard";

const LOCAL_FALLBACK = "http://127.0.0.1:3002";

export function getSiteUrl(): string {
	if (env.NEXT_PUBLIC_LYTERION_DASHBOARD_URL) {
		return env.NEXT_PUBLIC_LYTERION_DASHBOARD_URL;
	}
	if (env.NEXT_PUBLIC_LYTERION_NODE_ENV === "production") {
		throw new Error(
			"NEXT_PUBLIC_LYTERION_DASHBOARD_URL is required in production, metadata must not publish a localhost URL.",
		);
	}
	return LOCAL_FALLBACK;
}
