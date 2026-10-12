import { describe, expect, it } from "vitest";

import { auditSpotify } from "../audit";

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });

describe("auditSpotify", () => {
	it("records status and identifiers per endpoint, owned and followed playlists apart", async () => {
		const seen: string[] = [];
		const doFetch = (async (url: string) => {
			const path = url.replace("https://api.spotify.com/v1", "");
			seen.push(path);
			if (path === "/me") return json({ id: "me", product: "premium" });
			if (path.startsWith("/me/tracks"))
				return json({
					items: [{ track: { id: "t1", external_ids: { isrc: "GB1" } } }],
				});
			if (path.startsWith("/me/albums"))
				return json({
					items: [
						{
							album: {
								id: "a1",
								external_ids: { upc: "0123" },
								tracks: { items: [{ id: "t2" }] },
							},
						},
					],
				});
			if (path.startsWith("/me/following")) return json({ artists: {} });
			if (path.startsWith("/me/playlists"))
				return json({
					items: [
						{ id: "p-other", owner: { id: "someone" } },
						{ id: "p-mine", owner: { id: "me" } },
					],
				});
			if (path.startsWith("/playlists/p-mine/items"))
				return json({ items: [{ item: { external_ids: { isrc: "GB1" } } }] });
			if (path.startsWith("/playlists/p-other/items"))
				return json({ error: { message: "Forbidden" } }, 403);
			if (path.startsWith("/playlists/p-mine/images")) return json([]);
			if (path === "/tracks/t1") return json({ external_ids: { isrc: "GB1" } });
			if (path.startsWith("/tracks?ids")) return json({}, 403);
			if (path === "/albums/a1") return json({ external_ids: {} });
			return json({ error: { message: "Not found" } }, 404);
		}) as unknown as typeof fetch;

		const rows = await auditSpotify(async () => "token", doFetch);
		const by = Object.fromEntries(rows.map((r) => [r.name, r]));

		expect(by.profile).toMatchObject({ status: 200, note: "product premium" });
		expect(by["liked songs"]).toMatchObject({ status: 200, ids: "isrc" });
		expect(by["saved albums"]).toMatchObject({
			ids: "upc",
			note: "album tracks lack isrc",
		});
		expect(by["owned playlist items"]).toMatchObject({
			status: 200,
			ids: "isrc",
			note: "items[].item",
		});
		expect(by["followed playlist items"]).toMatchObject({
			status: 403,
			note: "Forbidden",
		});
		expect(by.track).toMatchObject({ status: 200, ids: "isrc" });
		expect(by["tracks batch"]).toMatchObject({ status: 403 });
		expect(by.album).toMatchObject({ status: 200, ids: "none" });
		expect(by["albums batch"]).toMatchObject({ status: 404 });
		expect(seen).toContain("/playlists/p-other/items?limit=1");
	});

	it("skips what the library can't exercise", async () => {
		const doFetch = (async (url: string) =>
			url.endsWith("/me")
				? json({ id: "me" })
				: json({ items: [] })) as unknown as typeof fetch;
		const rows = await auditSpotify(async () => "token", doFetch);
		expect(rows.find((r) => r.name === "track")).toMatchObject({
			status: null,
			note: "no liked song to try",
		});
	});
});
