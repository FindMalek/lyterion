import { describe, expect, it } from "vitest";

import { credentialKey, decryptJson, encryptJson } from "../crypto";
import {
	mergeCredentials,
	parseCredentials,
	validateCredentials,
} from "../form";

describe("credential encryption", () => {
	const key = credentialKey("x".repeat(32));

	it("round-trips and never stores plaintext", () => {
		const payload = encryptJson({ password: "hunter2" }, key);
		expect(payload).not.toContain("hunter2");
		expect(decryptJson(payload, key)).toEqual({ password: "hunter2" });
	});

	it("rejects a tampered payload or the wrong key", () => {
		const payload = encryptJson({ a: 1 }, key);
		const [iv, tag, data] = payload.split(".");
		const flipped = Buffer.from(data ?? "", "base64");
		flipped[0] = (flipped[0] ?? 0) ^ 1;
		expect(() =>
			decryptJson(`${iv}.${tag}.${flipped.toString("base64")}`, key),
		).toThrow();
		expect(() => decryptJson(payload, credentialKey("y".repeat(32)))).toThrow();
	});
});

describe("mergeCredentials", () => {
	const saved = {
		url: "https://music.example",
		user: "malek",
		password: "old",
	};

	it("keeps the saved secret when the form leaves it blank", () => {
		expect(
			mergeCredentials("navidrome", saved, {
				url: "https://music.example/",
				user: "malek",
				password: "",
			}),
		).toEqual({
			url: "https://music.example/",
			user: "malek",
			password: "old",
		});
	});

	it("replaces the secret when a new one is typed and drops unknown fields", () => {
		expect(
			mergeCredentials("navidrome", saved, {
				url: "https://music.example",
				user: "malek",
				password: "new",
				extra: "x",
			}),
		).toEqual({ url: "https://music.example", user: "malek", password: "new" });
	});

	it("clears a non-secret field the owner emptied", () => {
		expect(
			mergeCredentials("navidrome", saved, {
				url: "",
				user: "malek",
				password: "",
			}),
		).toEqual({ user: "malek", password: "old" });
	});
});

describe("validate and parse", () => {
	it("names the bad field", () => {
		const result = validateCredentials("navidrome", {
			url: "nope",
			user: "a",
			password: "b",
		});
		expect(result).toMatchObject({ ok: false });
		expect(result.ok ? "" : result.error).toMatch(/^url:/);
	});

	it("normalizes urls and splits proxy backends", () => {
		expect(
			parseCredentials("navidrome", {
				url: "https://m.example/",
				user: "a",
				password: "b",
			}),
		).toEqual({ url: "https://m.example", user: "a", password: "b" });
		expect(
			parseCredentials("proxy", {
				backends: "https://a.example/\nhttps://b.example, ",
			}),
		).toEqual({ backends: ["https://a.example", "https://b.example"] });
	});

	it("returns null for incomplete credentials instead of throwing", () => {
		expect(parseCredentials("slskd", { url: "http://slskd:5030" })).toBeNull();
		expect(parseCredentials("groq", null)).toBeNull();
	});
});
