import { describe, expect, it } from "vitest";

import { createSpotifyClient } from "../client";
import { exportLibrary } from "../export";

const A = "https://api.spotify.com/v1";
const weeknd = [{ id: "art1", name: "The Weeknd" }];
const blinding = {
	id: "t1",
	name: "Blinding Lights",
	artists: weeknd,
	album: {
		id: "alb1",
		name: "After Hours",
		artists: weeknd,
		external_ids: { upc: "602508575167" },
	},
	duration_ms: 200_040,
	external_ids: { isrc: "usug11904206" },
};
const albumTrack = (id: string, n: number) => ({
	id,
	name: `Song ${n}`,
	artists: weeknd,
	duration_ms: 180_000,
	track_number: n,
});

const routes: Record<string, unknown> = {
	[`${A}/me/tracks?limit=50&market=from_token`]: {
		items: [
			{ added_at: "2024-01-01T00:00:00Z", track: blinding },
			{ added_at: "2024-01-02T00:00:00Z", track: null },
		],
		next: null,
	},
	[`${A}/me/albums?limit=50&market=from_token`]: {
		items: [
			{
				added_at: "2024-02-01T00:00:00Z",
				album: {
					id: "alb2",
					name: "Dawn FM",
					artists: weeknd,
					external_ids: { upc: "1" },
					tracks: {
						items: [albumTrack("a1", 1)],
						next: `${A}/albums/alb2/tracks?offset=1`,
					},
				},
			},
		],
		next: null,
	},
	[`${A}/albums/alb2/tracks?offset=1`]: {
		items: [albumTrack("a2", 2)],
		next: null,
	},
	[`${A}/me/following?type=artist&limit=50`]: {
		artists: {
			items: [{ id: "art9", name: "NIN", genres: ["industrial"] }],
			next: null,
		},
	},
	[`${A}/me/playlists?limit=50`]: {
		items: [
			{
				id: "p1",
				name: "Drive",
				owner: { id: "me" },
				snapshot_id: "s1",
				collaborative: false,
			},
			{ id: "p2", name: "Someone else's", owner: { id: "them" } },
		],
		next: null,
	},
	[`${A}/playlists/p1/items?limit=100&market=from_token&additional_types=track`]:
		{
			items: [
				{ added_at: "2024-03-01T00:00:00Z", item: blinding },
				{
					added_at: "2024-03-01T00:00:00Z",
					is_local: true,
					item: {
						id: null,
						name: "Demo Tape",
						artists: [{ id: null, name: "Me" }],
						duration_ms: 90_000,
					},
				},
				{
					added_at: "2024-03-01T00:00:00Z",
					item: {
						id: "ep1",
						type: "episode",
						name: "Podcast",
						artists: [],
						duration_ms: 1,
					},
				},
				{ added_at: "2024-03-02T00:00:00Z", track: blinding },
			],
			next: null,
		},
};

describe("exportLibrary", () => {
	it("exports likes, saved albums with all their tracks, follows and playlists, keeping spotify's quirks", async () => {
		let rateLimited = false;
		const client = createSpotifyClient(
			async () => "token",
			async (url) => {
				const key = String(url);
				if (key.includes("/playlists/p2/"))
					return new Response("{}", { status: 403 });
				if (key.endsWith("/me/playlists?limit=50") && !rateLimited) {
					rateLimited = true;
					return new Response("{}", {
						status: 429,
						headers: { "retry-after": "0" },
					});
				}
				if (!(key in routes)) throw new Error(`unexpected ${key}`);
				return Response.json(routes[key]);
			},
		);

		const out = await exportLibrary(client);

		expect([...out.tracks.keys()].sort()).toEqual(["a1", "a2", "t1"]);
		expect(out.tracks.get("t1")).toMatchObject({
			isrc: "USUG11904206",
			albumId: "alb1",
		});
		expect(out.tracks.get("a2")).toMatchObject({
			albumId: "alb2",
			trackNumber: 2,
		});
		expect(out.saves.map((s) => `${s.kind}:${s.spotifyId}`)).toEqual([
			"liked_track:t1",
			"saved_album:alb2",
			"followed_artist:art9",
		]);
		expect(
			out.entries.map((e) => e.spotifyTrackId ?? `local:${e.localName}`),
		).toEqual(["t1", "local:Demo Tape", "t1"]);
		expect(out.entries.map((e) => e.position)).toEqual([0, 1, 2]);
		expect(out.playlists.find((p) => p.id === "p2")?.itemsUnavailable).toBe(
			true,
		);
		expect(out.skipped).toEqual({ episodes: 1, removed: 1 });
	});

	it("refreshes the token once on a 401", async () => {
		const tokens: boolean[] = [];
		let calls = 0;
		const client = createSpotifyClient(
			async (force) => {
				tokens.push(force);
				return force ? "fresh" : "stale";
			},
			async (_url, init) => {
				calls++;
				const auth = (init?.headers as Record<string, string> | undefined)
					?.authorization;
				return auth === "Bearer fresh"
					? Response.json({ ok: true })
					: new Response("", { status: 401 });
			},
		);
		expect(await client.get("/me")).toEqual({ ok: true });
		expect(tokens).toEqual([false, true]);
		expect(calls).toBe(2);
	});

	it("keeps one save and one playlist when spotify's paging repeats them", async () => {
		const liked = (n: number) => ({
			added_at: `2024-01-0${n}T00:00:00Z`,
			track: albumTrack(`l${n}`, n),
		});
		const drive = { id: "p1", name: "Drive", owner: { id: "me" } };
		const repeated: Record<string, unknown> = {
			[`${A}/me/tracks?limit=50&market=from_token`]: {
				items: [liked(1), liked(2)],
				next: `${A}/me/tracks?offset=2`,
			},
			// A like added mid-export shifts the list, so l2 comes back on the next page.
			[`${A}/me/tracks?offset=2`]: { items: [liked(2), liked(3)], next: null },
			[`${A}/me/albums?limit=50&market=from_token`]: { items: [], next: null },
			[`${A}/me/following?type=artist&limit=50`]: {
				artists: { items: [], next: null },
			},
			[`${A}/me/playlists?limit=50`]: {
				items: [drive],
				next: `${A}/me/playlists?offset=1`,
			},
			[`${A}/me/playlists?offset=1`]: { items: [drive], next: null },
			[`${A}/playlists/p1/items?limit=100&market=from_token&additional_types=track`]:
				{ items: [{ track: blinding }], next: null },
		};
		const client = createSpotifyClient(
			async () => "token",
			async (url) => {
				const key = String(url);
				if (!(key in repeated)) throw new Error(`unexpected ${key}`);
				return Response.json(repeated[key]);
			},
		);

		const out = await exportLibrary(client);

		expect(out.saves.map((s) => s.spotifyId)).toEqual(["l1", "l2", "l3"]);
		expect(out.playlists.map((p) => p.id)).toEqual(["p1"]);
		expect(out.entries).toHaveLength(1);
	});
});

describe("exportLibrary incremental", () => {
	it("stops at known saves, skips playlists whose snapshot didn't move, and marks the export partial", async () => {
		const pages: Record<string, unknown> = {
			[`${A}/me/tracks?limit=50&market=from_token`]: {
				items: [
					{
						added_at: "2024-05-01T00:00:00Z",
						track: { ...blinding, id: "new1" },
					},
					{ added_at: "2024-01-01T00:00:00Z", track: blinding },
				],
				next: `${A}/me/tracks?offset=50`,
			},
			[`${A}/me/albums?limit=50&market=from_token`]: { items: [], next: null },
			[`${A}/me/following?type=artist&limit=50`]: {
				artists: { items: [], next: null },
			},
			[`${A}/me/playlists?limit=50`]: {
				items: [
					{ id: "p1", name: "Drive", owner: { id: "me" }, snapshot_id: "s1" },
					{ id: "p3", name: "New", owner: { id: "me" }, snapshot_id: "s9" },
				],
				next: null,
			},
			[`${A}/playlists/p3/items?limit=100&market=from_token&additional_types=track`]:
				{ items: [], next: null },
		};
		const asked: string[] = [];
		const client = createSpotifyClient(
			async () => "token",
			async (url) => {
				const key = String(url);
				asked.push(key);
				if (!(key in pages)) throw new Error(`unexpected ${key}`);
				return Response.json(pages[key]);
			},
		);
		const out = await exportLibrary(
			client,
			{},
			{
				knownSaves: new Set(["liked_track:t1"]),
				since: new Date("2024-04-01T00:00:00Z"),
				playlistSnapshots: new Map([["p1", "s1"]]),
			},
		);
		expect(out.complete).toBe(false);
		expect(out.saves.map((s) => s.spotifyId)).toEqual(["new1", "t1"]);
		expect(asked).not.toContain(`${A}/me/tracks?offset=50`);
		expect([...out.unchangedPlaylists]).toEqual(["p1"]);
		expect(asked.some((u) => u.includes("/playlists/p1/items"))).toBe(false);
	});
});
