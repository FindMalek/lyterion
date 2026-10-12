import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { checkConnections, subsonicAuthParams } from "../connections";

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
		expect(byId.spotify).toMatchObject({ configured: true, ok: null });
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
