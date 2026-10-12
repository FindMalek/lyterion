import { type Auth, createAuth, type SpotifyApp } from "@lyterion/auth";
import { db } from "@lyterion/db";
import { user } from "@lyterion/db/schema/auth";
import { integrationCredential } from "@lyterion/db/schema/credential";
import { apiEnv } from "@lyterion/env/presets/api";
import { count, eq } from "drizzle-orm";

import { credentialKey, decryptJson } from "./crypto";

export { spotifyRedirectUri } from "@lyterion/auth";

/** Single place where server singletons (db, auth) are wired, so packages never import each other in a cycle. */
export const database = db;

export async function countUsers(): Promise<number> {
	const [row] = await db.select({ value: count() }).from(user);
	return row?.value ?? 0;
}

export function credentialSecret(): string {
	return apiEnv.LYTERION_ENCRYPTION_KEY ?? apiEnv.LYTERION_BETTER_AUTH_SECRET;
}

// Dashboard value first, env as the self-hoster fallback; same order as getCredentials in common.
export async function spotifyApp(): Promise<SpotifyApp | null> {
	const [row] = await db
		.select({ payload: integrationCredential.payload })
		.from(integrationCredential)
		.where(eq(integrationCredential.kind, "spotify"))
		.limit(1);
	if (row) {
		const stored = decryptJson<Partial<SpotifyApp>>(
			row.payload,
			credentialKey(credentialSecret()),
		);
		if (stored.clientId && stored.clientSecret)
			return { clientId: stored.clientId, clientSecret: stored.clientSecret };
	}
	return apiEnv.LYTERION_SPOTIFY_CLIENT_ID &&
		apiEnv.LYTERION_SPOTIFY_CLIENT_SECRET
		? {
				clientId: apiEnv.LYTERION_SPOTIFY_CLIENT_ID,
				clientSecret: apiEnv.LYTERION_SPOTIFY_CLIENT_SECRET,
			}
		: null;
}

const RECHECK_MS = 30_000;
let cached: { key: string; auth: Auth; checkedAt: number } | null = null;

/** Built lazily: the Spotify app can be saved from onboarding after boot, so auth is rebuilt when it changes. */
export async function getAuth(): Promise<Auth> {
	if (cached && Date.now() - cached.checkedAt < RECHECK_MS) return cached.auth;
	const spotify = await spotifyApp();
	const key = spotify ? `${spotify.clientId}:${spotify.clientSecret}` : "";
	if (cached?.key === key) {
		cached.checkedAt = Date.now();
		return cached.auth;
	}
	const auth = createAuth(
		db,
		{
			LYTERION_BETTER_AUTH_SECRET: apiEnv.LYTERION_BETTER_AUTH_SECRET,
			spotify,
			NEXT_PUBLIC_LYTERION_API_URL: apiEnv.NEXT_PUBLIC_LYTERION_API_URL,
			NEXT_PUBLIC_LYTERION_DASHBOARD_URL:
				apiEnv.NEXT_PUBLIC_LYTERION_DASHBOARD_URL,
			LYTERION_AUTH_PRODUCTION_URL: apiEnv.LYTERION_AUTH_PRODUCTION_URL,
			LYTERION_COOKIE_DOMAIN: apiEnv.LYTERION_COOKIE_DOMAIN,
		},
		countUsers,
	);
	cached = { key, auth, checkedAt: Date.now() };
	return auth;
}

/** Call after the Spotify app changes so the next request picks it up at once. */
export function resetAuth(): void {
	cached = null;
}

export type Session = Awaited<ReturnType<Auth["api"]["getSession"]>>;
