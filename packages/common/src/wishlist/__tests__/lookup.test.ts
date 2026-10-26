import { describe, expect, it } from "vitest";

import {
	createYoutubeLookup,
	createYoutubeProvider,
	isMediaLink,
} from "../../providers/youtube";

const lookupWith = (entry: object) =>
	createYoutubeLookup({ run: async () => `${JSON.stringify(entry)}\n` });

describe("youtube lookup", () => {
	it("knows a link from a name", () => {
		expect(isMediaLink("https://youtu.be/abc")).toBe(true);
		expect(isMediaLink("https://music.youtube.com/watch?v=abc")).toBe(true);
		expect(isMediaLink("massive attack teardrop")).toBe(false);
	});

	it("splits Artist - Title on a plain upload", async () => {
		expect(
			await lookupWith({
				id: "a",
				title: "Massive Attack - Teardrop",
				duration: 330.4,
				channel: "Someone",
			})("https://youtu.be/a"),
		).toMatchObject({
			title: "Teardrop",
			artists: ["Massive Attack"],
			durationMs: 330400,
			linkUrl: "https://youtu.be/a",
			source: "youtube",
		});
	});

	it("prefers the track and artist fields of a Music upload", async () => {
		expect(
			await lookupWith({
				id: "b",
				title: "Teardrop",
				track: "Teardrop",
				artists: ["Massive Attack"],
				duration: 330,
			})("teardrop"),
		).toMatchObject({
			title: "Teardrop",
			artists: ["Massive Attack"],
			// A typed name pins the video the lookup picked.
			linkUrl: "https://www.youtube.com/watch?v=b",
		});
	});
});

describe("pinned link", () => {
	it("offers exactly the pasted video and skips searching", async () => {
		const provider = createYoutubeProvider({
			run: async () => {
				throw new Error("should not search");
			},
		});
		expect(
			await provider.search({
				recordingId: "r",
				isrcs: [],
				title: "Widows Weep",
				artists: ["SHYLER"],
				album: null,
				durationMs: 132_000,
				spotifyTrackId: null,
				linkUrl: "https://www.youtube.com/watch?v=YmBN_ZzSD_8",
			}),
		).toMatchObject([
			{
				ref: "https://www.youtube.com/watch?v=YmBN_ZzSD_8",
				matchConfidence: 1,
			},
		]);
	});
});
