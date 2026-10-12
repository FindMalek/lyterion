import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";

// A dedicated key when set, else one derived from the auth secret, so a fresh install needs nothing extra.
export function credentialKey(secret: string): Buffer {
	return createHash("sha256").update(`lyterion-credentials:${secret}`).digest();
}

export function encryptJson(value: unknown, key: Buffer): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const data = Buffer.concat([
		cipher.update(JSON.stringify(value), "utf8"),
		cipher.final(),
	]);
	return [iv, cipher.getAuthTag(), data]
		.map((b) => b.toString("base64"))
		.join(".");
}

export function decryptJson<T>(payload: string, key: Buffer): T {
	const [iv, tag, data] = payload
		.split(".")
		.map((p) => Buffer.from(p, "base64"));
	if (!iv || !tag || !data) throw new Error("malformed credential payload");
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	const text = Buffer.concat([
		decipher.update(data),
		decipher.final(),
	]).toString("utf8");
	return JSON.parse(text) as T;
}
