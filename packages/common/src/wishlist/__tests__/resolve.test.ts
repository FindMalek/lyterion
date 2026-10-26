import { describe, expect, it } from "vitest";

import { deezerMeta, resolveWish } from "../resolve";

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
