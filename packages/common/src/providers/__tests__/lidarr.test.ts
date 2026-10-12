import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	createLidarrClient,
	createLidarrProvider,
	type LidarrAlbum,
	localPath,
} from "../lidarr";

const mezzanine: LidarrAlbum = {
	title: "Mezzanine",
	foreignAlbumId: "rg-mezzanine",
	artist: { artistName: "Massive Attack", foreignArtistId: "ar-ma" },
};

type Call = { method: string; route: string; body?: unknown };

function fakeLidarr(routes: Record<string, unknown>, calls: Call[] = []) {
	return (async (url: string, init: RequestInit = {}) => {
		const route = url.replace("http://lidarr:8686/api/v1", "");
		const method = init.method ?? "GET";
		calls.push({
			method,
			route,
			body: init.body ? JSON.parse(String(init.body)) : undefined,
		});
		const key = `${method} ${route.split("?")[0]}`;
		if (!(key in routes)) return new Response("not found", { status: 404 });
		return new Response(JSON.stringify(routes[key]));
	}) as unknown as typeof fetch;
}

const target = {
	recordingId: "r1",
	isrcs: [],
	title: "Angel",
	artists: ["Massive Attack"],
	album: "Mezzanine",
	durationMs: 379_000,
	spotifyTrackId: null,
};

describe("lidarr provider", () => {
	it("offers imported files of the matching album and copies them from the mapped root", async () => {
		const root = mkdtempSync(join(tmpdir(), "lyterion-lidarr-"));
		mkdirSync(join(root, "local/Massive Attack/Mezzanine"), {
			recursive: true,
		});
		writeFileSync(
			join(root, "local/Massive Attack/Mezzanine/01 Angel.flac"),
			"flac",
		);
		const provider = createLidarrProvider({
			url: "http://lidarr:8686",
			apiKey: "k",
			lidarrRoot: "/music",
			localRoot: join(root, "local"),
			fetch: fakeLidarr({
				"GET /album/lookup": [
					{ ...mezzanine, title: "Mezzanine (Deluxe)" },
					mezzanine,
				],
				"GET /album": [{ ...mezzanine, id: 7 }],
				"GET /track": [
					{ title: "Angel", duration: 378_500, trackFileId: 1, hasFile: true },
					{
						title: "Angel (Live)",
						duration: 379_000,
						trackFileId: 2,
						hasFile: true,
					},
					{
						title: "Teardrop",
						duration: 330_000,
						trackFileId: 3,
						hasFile: false,
					},
				],
				"GET /trackfile": [
					{
						id: 1,
						path: "/music/Massive Attack/Mezzanine/01 Angel.flac",
						mediaInfo: { audioBits: "16", audioSampleRate: "44100" },
					},
					{ id: 2, path: "/music/Massive Attack/Live/01 Angel.flac" },
				],
			}),
		});

		const candidates = await provider.search(target);
		expect(candidates).toEqual([
			expect.objectContaining({
				providerId: "lidarr",
				ref: "/music/Massive Attack/Mezzanine/01 Angel.flac",
				format: "flac",
				bitDepth: 16,
				sampleRateHz: 44_100,
			}),
		]);

		const fetched = await provider.fetch(
			candidates[0] as (typeof candidates)[number],
			join(root, "staging"),
		);
		expect(readFileSync(fetched.path, "utf8")).toBe("flac");
		expect(
			readFileSync(
				join(root, "local/Massive Attack/Mezzanine/01 Angel.flac"),
				"utf8",
			),
		).toBe("flac");
	});

	it("offers nothing until lidarr holds the album", async () => {
		const provider = createLidarrProvider({
			url: "http://lidarr:8686",
			apiKey: "k",
			fetch: fakeLidarr({ "GET /album/lookup": [mezzanine], "GET /album": [] }),
		});
		expect(await provider.search(target)).toEqual([]);
	});
});

describe("lidarr requests", () => {
	it("adds a new album with its artist and searches for it", async () => {
		const calls: Call[] = [];
		const client = createLidarrClient({
			url: "http://lidarr:8686",
			apiKey: "k",
			fetch: fakeLidarr(
				{
					"GET /album": [],
					"GET /rootfolder": [{ path: "/music" }],
					"GET /qualityprofile": [{ id: 2 }],
					"GET /metadataprofile": [{ id: 3 }],
					"POST /album": { ...mezzanine, id: 9 },
				},
				calls,
			),
		});
		await client.requestAlbum(mezzanine);
		const post = calls.find((c) => c.method === "POST");
		expect(post?.body).toMatchObject({
			foreignAlbumId: "rg-mezzanine",
			monitored: true,
			addOptions: { searchForNewAlbum: true },
			artist: {
				rootFolderPath: "/music",
				qualityProfileId: 2,
				metadataProfileId: 3,
				addOptions: { monitor: "none" },
			},
		});
	});

	it("monitors and searches an album lidarr already knows", async () => {
		const calls: Call[] = [];
		const client = createLidarrClient({
			url: "http://lidarr:8686",
			apiKey: "k",
			fetch: fakeLidarr(
				{
					"GET /album": [{ ...mezzanine, id: 7, monitored: false }],
					"PUT /album/monitor": {},
					"POST /command": {},
				},
				calls,
			),
		});
		await client.requestAlbum(mezzanine);
		expect(calls.filter((c) => c.method !== "GET")).toEqual([
			{
				method: "PUT",
				route: "/album/monitor",
				body: { albumIds: [7], monitored: true },
			},
			{
				method: "POST",
				route: "/command",
				body: { name: "AlbumSearch", albumIds: [7] },
			},
		]);
	});
});

describe("localPath", () => {
	it("maps lidarr's root onto the worker mount", () => {
		expect(
			localPath("/music/A/B/01 x.flac", {
				lidarrRoot: "/music",
				localRoot: "/lidarr",
			}),
		).toBe("/lidarr/A/B/01 x.flac");
		expect(
			localPath("/other/x.flac", {
				lidarrRoot: "/music",
				localRoot: "/lidarr",
			}),
		).toBe("/other/x.flac");
	});
});
