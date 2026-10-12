import {
	CREDENTIAL_KINDS,
	type CredentialField,
	type CredentialKind,
	type Credentials,
} from "./kinds";

export type RawCredentials = Record<string, string>;

export function parseCredentials<K extends CredentialKind>(
	kind: K,
	raw: RawCredentials | null,
): Credentials<K> | null {
	if (!raw) return null;
	const parsed = CREDENTIAL_KINDS[kind].schema.safeParse(raw);
	return parsed.success ? (parsed.data as Credentials<K>) : null;
}

// A blank secret in the form means "keep the saved one", so secrets never travel back to the browser.
export function mergeCredentials(
	kind: CredentialKind,
	current: RawCredentials | null,
	incoming: RawCredentials,
): RawCredentials {
	const merged: RawCredentials = {};
	for (const field of CREDENTIAL_KINDS[kind]
		.fields as readonly CredentialField[]) {
		const value = incoming[field.name]?.trim() ?? "";
		const kept = field.secret && value === "" ? current?.[field.name] : value;
		if (kept) merged[field.name] = kept;
	}
	return merged;
}

export function validateCredentials(
	kind: CredentialKind,
	raw: RawCredentials,
): { ok: true } | { ok: false; error: string } {
	const parsed = CREDENTIAL_KINDS[kind].schema.safeParse(raw);
	if (parsed.success) return { ok: true };
	const issue = parsed.error.issues[0];
	return {
		ok: false,
		error: issue
			? `${issue.path.join(".") || kind}: ${issue.message}`
			: "invalid",
	};
}
