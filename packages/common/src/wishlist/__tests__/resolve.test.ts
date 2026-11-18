import { describe, expect, it } from "vitest";

import {
	deezerCandidates,
	deezerMeta,
	quickWish,
	resolveWish,
	searchCandidates,
} from "../resolve";

const deezerFetch = (async (url: string) => ({
	ok: true,
	url,
	json: async () => ({
		title: "Saint Laurent",
		duration: 155,
		isrc: "USUM71234567",
		artist: { name: "Ty Dolla $ign" },
		album: { cover_medium: "https://cdn/cover.jpg" },
	}),
})) as unknown as typeof fetch;

describe("resolveWish", () => {
	it("reads a deezer link through its public api, isrc included", async () => {
		expect(
			await deezerMeta("https://www.deezer.com/en/track/123", deezerFetch),
		).toMatchObject({
			title: "Saint Laurent",
			artists: ["Ty Dolla $ign"],
			durationMs: 155000,
			isrc: "USUM71234567",
			source: "deezer",
		});
	});

	it("refuses a deezer album link", async () => {
		await expect(
			resolveWish("https://www.deezer.com/en/album/1", {
				deezer: (url) => deezerMeta(url, deezerFetch),
			}),
		).rejects.toThrow("deezer track link");
	});

	it("sends anything else to the youtube lookup", async () => {
		const meta = { title: "t", artists: ["a"], durationMs: 1000 };
		expect(
			await resolveWish("ty saint laurent", { youtube: async () => meta }),
		).toBe(meta);
	});
});

const jsonFetch = (body: unknown, ok = true) =>
	(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("quickWish", () => {
	it("takes a confident deezer hit for a name, length and isrc included", async () => {
		const hit = {
			data: [
				{
					title: "Teardrop",
					duration: 327,
					isrc: "GBAAA9800001",
					artist: { name: "Massive Attack" },
				},
			],
		};
		expect(
			await quickWish("massive attack teardrop", jsonFetch(hit)),
		).toMatchObject({
			title: "Teardrop",
			artists: ["Massive Attack"],
			durationMs: 327000,
			source: "deezer",
		});
	});

	it("leaves a typo or an unreleased track for the add task to find", async () => {
		const wrong = {
			data: [
				{ title: "Seven Widows", duration: 200, artist: { name: "Other" } },
			],
		};
		expect(await quickWish("shyler widows weep", jsonFetch(wrong))).toEqual({
			title: "shyler widows weep",
			artists: [],
			durationMs: 0,
			source: "search",
		});
	});

	it("reads a youtube link through oembed without a length", async () => {
		const oembed = {
			title: "SHYLER - Widows Weep (prod: palence)",
			author_name: "SHYLER archive",
			thumbnail_url: "https://i.ytimg.com/vi/x/hq.jpg",
		};
		expect(
			await quickWish("https://youtu.be/x", jsonFetch(oembed)),
		).toMatchObject({
			title: "Widows Weep",
			artists: ["SHYLER"],
			durationMs: 0,
			linkUrl: "https://youtu.be/x",
			source: "youtube",
		});
	});

	it("splits a soundcloud 'Title by Artist'", async () => {
		const oembed = { title: "Flickermood by Forss", author_name: "Forss" };
		expect(
			await quickWish(
				"https://soundcloud.com/forss/flickermood",
				jsonFetch(oembed),
			),
		).toMatchObject({
			title: "Flickermood",
			artists: ["Forss"],
			source: "soundcloud",
		});
	});
});

describe("deezerCandidates", () => {
	it("lists hits with the track link the add takes, skipping ones without a length", async () => {
		const hits = {
			data: [
				{
					id: 7,
					title: "Teardrop",
					duration: 327,
					artist: { name: "Massive Attack" },
				},
				{
					id: 8,
					title: "Broken",
					duration: 0,
					artist: { name: "Massive Attack" },
				},
			],
		};
		expect(await deezerCandidates("teardrop", jsonFetch(hits))).toMatchObject([
			{
				title: "Teardrop",
				artists: ["Massive Attack"],
				durationMs: 327000,
				source: "deezer",
				input: "https://www.deezer.com/track/7",
			},
		]);
	});
});

describe("searchCandidates", () => {
	it("puts deezer first and keeps the rest when a source fails", async () => {
		const deezer = async () => [
			{
				title: "Teardrop",
				artists: ["Massive Attack"],
				durationMs: 327000,
				source: "deezer" as const,
				input: "https://www.deezer.com/track/7",
			},
		];
		const run = async (args: string[]) => {
			if (args.some((a) => a.startsWith("scsearch"))) throw new Error("down");
			return `${JSON.stringify({ id: "abc", title: "Massive Attack - Teardrop", duration: 330, uploader: "MA" })}\n`;
		};
		const { candidates: found, unreachable } = await searchCandidates(
			"teardrop",
			{ deezer, run },
		);
		expect(unreachable).toEqual(["soundcloud"]);
		expect(found.map((c) => [c.source, c.input])).toEqual([
			["deezer", "https://www.deezer.com/track/7"],
			["youtube", "https://www.youtube.com/watch?v=abc"],
		]);
		expect(found[1]).toMatchObject({
			title: "Teardrop",
			artists: ["Massive Attack"],
		});
	});
});
