import { randomInt, timingSafeEqual } from "node:crypto";

import { countUsers } from "@lyterion/core";

import { getCursor, setCursor } from "../notify/owner";

const KEY = "onboarding.setupCode";
// No 0/O or 1/I, so the code survives being read off a log line.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateSetupCode(): string {
	const chars = Array.from(
		{ length: 12 },
		() => ALPHABET[randomInt(ALPHABET.length)],
	);
	return [0, 4, 8].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

export function normalizeSetupCode(code: string): string {
	return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The one-time code that guards onboarding until an owner exists (#83); null once someone owns the instance. */
export async function ensureSetupCode(): Promise<string | null> {
	if ((await countUsers()) > 0) return null;
	const existing = await getCursor(KEY);
	if (existing) return existing;
	const code = generateSetupCode();
	await setCursor(KEY, code);
	return code;
}

export async function checkSetupCode(code: string): Promise<boolean> {
	const expected = await getCursor(KEY);
	if (!expected) return false;
	const a = Buffer.from(normalizeSetupCode(code));
	const b = Buffer.from(normalizeSetupCode(expected));
	return a.length === b.length && timingSafeEqual(a, b);
}
