export function createServerRuntimeEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		NEXT_PUBLIC_LYTERION_ALLOWED_ORIGIN:
			process.env.NEXT_PUBLIC_LYTERION_ALLOWED_ORIGIN ??
			process.env.NEXT_PUBLIC_LYTERION_API_URL,
	};
}

/** Next.js only inlines NEXT_PUBLIC_* on literal property access, so keep these spelled out. */
export function createNextjsRuntimeEnv() {
	return {
		LYTERION_DATABASE_URL: process.env.LYTERION_DATABASE_URL,
		LYTERION_API_INTERNAL_URL: process.env.LYTERION_API_INTERNAL_URL,
		NEXT_PUBLIC_LYTERION_NODE_ENV: process.env.NEXT_PUBLIC_LYTERION_NODE_ENV,
		NEXT_PUBLIC_LYTERION_API_URL: process.env.NEXT_PUBLIC_LYTERION_API_URL,
		NEXT_PUBLIC_LYTERION_ALLOWED_ORIGIN:
			process.env.NEXT_PUBLIC_LYTERION_ALLOWED_ORIGIN,
		NEXT_PUBLIC_LYTERION_DASHBOARD_URL:
			process.env.NEXT_PUBLIC_LYTERION_DASHBOARD_URL,
	} as const;
}
