import { database, resetAuth } from "@lyterion/core";
import { integrationCredential } from "@lyterion/db/schema/credential";
import { env } from "@lyterion/env/server";
import { eq } from "drizzle-orm";

import { credentialKey, decryptJson, encryptJson } from "./crypto";
import { parseCredentials, type RawCredentials } from "./form";
import {
	CREDENTIAL_KINDS,
	type CredentialField,
	type CredentialKind,
	type Credentials,
} from "./kinds";

export type { RawCredentials } from "./form";
export type CredentialSource = "dashboard" | "env" | null;

function key() {
	return credentialKey(
		env.LYTERION_ENCRYPTION_KEY ?? env.LYTERION_BETTER_AUTH_SECRET,
	);
}

// Env vars keep working for self-hosters and CI; the dashboard value wins when both exist.
export function envCredentials(kind: CredentialKind): RawCredentials | null {
	const pick = (values: Record<string, string | undefined>) =>
		Object.values(values).some(Boolean)
			? (Object.fromEntries(
					Object.entries(values).filter(([, v]) => v !== undefined),
				) as RawCredentials)
			: null;
	switch (kind) {
		case "spotify":
			return pick({
				clientId: env.LYTERION_SPOTIFY_CLIENT_ID,
				clientSecret: env.LYTERION_SPOTIFY_CLIENT_SECRET,
			});
		case "navidrome":
			return pick({
				url: env.LYTERION_NAVIDROME_URL,
				user: env.LYTERION_NAVIDROME_USER,
				password: env.LYTERION_NAVIDROME_PASSWORD,
			});
		case "slskd":
			return pick({
				url: env.LYTERION_SLSKD_URL,
				apiKey: env.LYTERION_SLSKD_API_KEY,
			});
		case "proxy":
			return env.LYTERION_PROXY_BACKENDS.length > 0
				? { backends: env.LYTERION_PROXY_BACKENDS.join("\n") }
				: null;
		case "lidarr":
			return null;
		case "deezer":
			return pick({ arl: env.LYTERION_DEEZER_ARL });
		case "acoustid":
			return pick({ apiKey: env.LYTERION_ACOUSTID_API_KEY });
		case "groq":
			return pick({ apiKey: env.LYTERION_GROQ_API_KEY });
		case "jev":
			return pick({ apiKey: env.LYTERION_JEV_API_KEY });
		case "ntfy":
			return env.LYTERION_NTFY_URL
				? pick({
						url: env.LYTERION_NTFY_URL,
						topic: env.LYTERION_NTFY_TOPIC,
						token: env.LYTERION_NTFY_TOKEN,
					})
				: null;
	}
}

async function storedCredentials(
	kind: CredentialKind,
): Promise<RawCredentials | null> {
	const [row] = await database
		.select({ payload: integrationCredential.payload })
		.from(integrationCredential)
		.where(eq(integrationCredential.kind, kind))
		.limit(1);
	return row ? decryptJson<RawCredentials>(row.payload, key()) : null;
}

export async function rawCredentials(
	kind: CredentialKind,
): Promise<{ raw: RawCredentials | null; source: CredentialSource }> {
	const stored = await storedCredentials(kind);
	if (stored) return { raw: stored, source: "dashboard" };
	const fromEnv = envCredentials(kind);
	return { raw: fromEnv, source: fromEnv ? "env" : null };
}

/** The one read path for api and tasks: dashboard value, else env, else null. */
export async function getCredentials<K extends CredentialKind>(
	kind: K,
): Promise<Credentials<K> | null> {
	return parseCredentials(kind, (await rawCredentials(kind)).raw);
}

export async function saveCredentials(
	kind: CredentialKind,
	raw: RawCredentials,
): Promise<void> {
	const payload = encryptJson(raw, key());
	await database
		.insert(integrationCredential)
		.values({ kind, payload, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: integrationCredential.kind,
			set: { payload, updatedAt: new Date() },
		});
	if (kind === "spotify") resetAuth();
}

export async function clearCredentials(kind: CredentialKind): Promise<void> {
	await database
		.delete(integrationCredential)
		.where(eq(integrationCredential.kind, kind));
	if (kind === "spotify") resetAuth();
}

export type CredentialForm = {
	kind: CredentialKind;
	help: string;
	source: CredentialSource;
	fields: (CredentialField & { value: string; saved: boolean })[];
};

// What the dashboard renders: non-secret values filled in, secrets only flagged as saved.
export async function describeCredentials(): Promise<CredentialForm[]> {
	return Promise.all(
		(Object.keys(CREDENTIAL_KINDS) as CredentialKind[]).map(async (kind) => {
			const { raw, source } = await rawCredentials(kind);
			const spec = CREDENTIAL_KINDS[kind];
			return {
				kind,
				help: spec.help,
				source,
				fields: (spec.fields as readonly CredentialField[]).map((field) => ({
					...field,
					value: field.secret ? "" : (raw?.[field.name] ?? ""),
					saved: Boolean(raw?.[field.name]),
				})),
			};
		}),
	);
}
