import { createAuth } from "@lyterion/auth";
import { db } from "@lyterion/db";
import { user } from "@lyterion/db/schema/auth";
import { apiEnv } from "@lyterion/env/presets/api";
import { count } from "drizzle-orm";

/** Single place where server singletons (db, auth) are wired, so packages never import each other in a cycle. */
export const database = db;

export const auth = createAuth(
	db,
	{
		LYTERION_BETTER_AUTH_SECRET: apiEnv.LYTERION_BETTER_AUTH_SECRET,
		LYTERION_SPOTIFY_CLIENT_ID: apiEnv.LYTERION_SPOTIFY_CLIENT_ID,
		LYTERION_SPOTIFY_CLIENT_SECRET: apiEnv.LYTERION_SPOTIFY_CLIENT_SECRET,
		NEXT_PUBLIC_LYTERION_API_URL: apiEnv.NEXT_PUBLIC_LYTERION_API_URL,
		NEXT_PUBLIC_LYTERION_DASHBOARD_URL:
			apiEnv.NEXT_PUBLIC_LYTERION_DASHBOARD_URL,
		LYTERION_AUTH_PRODUCTION_URL: apiEnv.LYTERION_AUTH_PRODUCTION_URL,
		LYTERION_COOKIE_DOMAIN: apiEnv.LYTERION_COOKIE_DOMAIN,
	},
	async () => {
		const [row] = await db.select({ value: count() }).from(user);
		return row?.value ?? 0;
	},
);
