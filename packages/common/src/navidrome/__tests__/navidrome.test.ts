import { describe, expect, it } from "vitest";

import { createNavidromeClient } from "../client";
import { linkByPath, scanDue } from "../link";

describe("linkByPath", () => {
	it("maps absolute library files to Navidrome's relative song paths", () => {
		const links = linkByPath(
			[
				{
					id: 1,
					path: "/music/lyterion/Massive Attack/Mezzanine (1998)/01 Angel.flac",
				},
				{ id: 2, path: "/music/lyterion/Nobody/Nothing/01 Gone.flac" },
			],
			[
				{
					id: "nd-1",
					title: "Angel",
					path: "lyterion/Massive Attack/Mezzanine (1998)/01 Angel.flac",
				},
				{ id: "nd-x", title: "Other", path: "beets/Other/x.flac" },
			],
			"/music",
		);
		expect([...links]).toEqual([[1, "nd-1"]]);
	});
});

describe("scanDue", () => {
	const now = new Date("2026-10-12T12:00:00Z");
	it("waits for 200 files or 10 quiet minutes, and never scans for nothing", () => {
		expect(scanDue({ pending: 0, lastPlacedAt: now }, now, true)).toBe(false);
		expect(scanDue({ pending: 200, lastPlacedAt: now }, now)).toBe(true);
		expect(
			scanDue(
				{ pending: 3, lastPlacedAt: new Date(now.getTime() - 5 * 60_000) },
				now,
			),
		).toBe(false);
		expect(
			scanDue(
				{ pending: 3, lastPlacedAt: new Date(now.getTime() - 11 * 60_000) },
				now,
			),
		).toBe(true);
		expect(scanDue({ pending: 3, lastPlacedAt: now }, now, true)).toBe(true);
	});
});

describe("createNavidromeClient", () => {
	it("pages search3 until a short page and surfaces subsonic errors", async () => {
		const offsets: string[] = [];
		const client = createNavidromeClient(
			{ url: "https://nd.example/", user: "u", password: "p" },
			(async (input: string | URL | Request) => {
				const url = new URL(String(input));
				if (url.pathname === "/rest/search3.view") {
					const offset = url.searchParams.get("songOffset") ?? "0";
					offsets.push(offset);
					const count = offset === "0" ? 500 : 2;
					return Response.json({
						"subsonic-response": {
							status: "ok",
							searchResult3: {
								song: Array.from({ length: count }, (_, i) => ({
									id: `${offset}-${i}`,
									title: "t",
								})),
							},
						},
					});
				}
				return Response.json({
					"subsonic-response": {
						status: "failed",
						error: { message: "Wrong username or password" },
					},
				});
			}) as typeof fetch,
		);
		expect(await client.allSongs()).toHaveLength(502);
		expect(offsets).toEqual(["0", "500"]);
		await expect(client.startScan()).rejects.toThrow(
			"startScan: Wrong username or password",
		);
	});
});

import { planStars } from "../stars";

describe("planStars", () => {
	const ids = (
		songs: string[] = [],
		albums: string[] = [],
		artists: string[] = [],
	) => ({
		songs: new Set(songs),
		albums: new Set(albums),
		artists: new Set(artists),
	});

	it("stars what is missing, unstars only Spotify removals, keeps the owner's own stars", () => {
		const plan = planStars({
			wanted: ids(["s1", "s2"], ["a1"], ["ar1"]),
			removed: ids(["s3", "s4"]),
			starred: ids(["s1", "s3", "own"], [], ["ar1"]),
		});
		expect(plan.star).toEqual({ id: ["s2"], albumId: ["a1"], artistId: [] });
		expect(plan.unstar).toEqual({ id: ["s3"], albumId: [], artistId: [] });
	});

	it("never unstars something that is wanted again", () => {
		const plan = planStars({
			wanted: ids(["s1"]),
			removed: ids(["s1"]),
			starred: ids(["s1"]),
		});
		expect(plan.unstar.id).toEqual([]);
	});
});
