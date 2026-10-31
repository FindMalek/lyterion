import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
	checkConnections,
	subsonicAuthParams,
	testSpotifyApp,
} from "../connections";

describe("checkConnections", () => {
	it("probes configured services, reports failures, leaves unconfigured ones unprobed", async () => {
		const calls: string[] = [];
		const rows = await checkConnections(
			{
				spotifyLinked: true,
				navidrome: {
					url: "https://music.example",
					user: "findmalek",
					password: "pw",
				},
				slskd: { url: "http://slskd:5030", apiKey: "k" },
				proxyBackends: [],
			},
			async (url) => {
				calls.push(String(url).split("?")[0] ?? "");
				if (String(url).includes("ping.view"))
					return Response.json({ "subsonic-response": { status: "ok" } });
				return new Response("nope", { status: 401 });
			},
		);
		const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

		expect(calls).toEqual([
			"https://music.example/rest/ping.view",
			"http://slskd:5030/api/v0/application",
		]);
		expect(byId.navidrome).toMatchObject({ configured: true, ok: true });
		expect(byId.slskd).toMatchObject({
			configured: true,
			ok: false,
			detail: "HTTP 401",
		});
		expect(byId.spotify).toMatchObject({
			configured: true,
			setUp: true,
			ok: null,
		});
		expect(byId.deezer).toMatchObject({ setUp: false });
		expect(byId.deezer).toMatchObject({ configured: false, ok: false });
	});

	it("signs subsonic calls with md5(password + salt)", () => {
		const params = subsonicAuthParams("findmalek", "pw", "abc");
		expect(params.get("t")).toBe(
			createHash("md5").update("pwabc").digest("hex"),
		);
		expect(params.get("s")).toBe("abc");
	});
});

describe("testSpotifyApp", () => {
	it("names a rejected client id or secret", async () => {
		const doFetch = (async () =>
			new Response(JSON.stringify({ error: "invalid_client" }), {
				status: 400,
			})) as unknown as typeof fetch;
		expect(
			await testSpotifyApp({ clientId: "a", clientSecret: "b" }, doFetch),
		).toEqual({
			ok: false,
			detail: "spotify rejected the client id or secret",
		});
	});

	it("does not report a rate limit as down", async () => {
		const doFetch = (async () =>
			new Response("", {
				status: 429,
				headers: { "retry-after": "30" },
			})) as unknown as typeof fetch;
		expect(
			await testSpotifyApp({ clientId: "a", clientSecret: "b" }, doFetch),
		).toEqual({ ok: true, detail: "rate limited, retry in 30s" });
	});

	it("does not report a timeout as down", async () => {
		const doFetch = (async () => {
			throw new DOMException("timed out", "TimeoutError");
		}) as unknown as typeof fetch;
		expect(
			await testSpotifyApp({ clientId: "a", clientSecret: "b" }, doFetch),
		).toEqual({ ok: true, detail: "accounts.spotify.com timed out" });
	});

	it("accepts a token", async () => {
		let auth = "";
		const doFetch = (async (_url: string, init: RequestInit) => {
			auth = new Headers(init.headers).get("Authorization") ?? "";
			return new Response(JSON.stringify({ access_token: "x" }));
		}) as unknown as typeof fetch;
		expect(
			await testSpotifyApp({ clientId: "a", clientSecret: "b" }, doFetch),
		).toEqual({ ok: true });
		expect(auth).toBe(`Basic ${Buffer.from("a:b").toString("base64")}`);
	});
});
