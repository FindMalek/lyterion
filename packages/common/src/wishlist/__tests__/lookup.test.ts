import { describe, expect, it } from "vitest";

import {
	createYoutubeLookup,
	createYoutubeProvider,
	isYoutubeUrl,
} from "../../providers/youtube";

const lookupWith = (entry: object) =>
	createYoutubeLookup({ run: async () => `${JSON.stringify(entry)}\n` });

describe("youtube lookup", () => {
	it("knows a link from a name", () => {
		expect(isYoutubeUrl("https://youtu.be/abc")).toBe(true);
		expect(isYoutubeUrl("https://music.youtube.com/watch?v=abc")).toBe(true);
		expect(isYoutubeUrl("massive attack teardrop")).toBe(false);
	});

	it("splits Artist - Title on a plain upload", async () => {
		expect(
			await lookupWith({
				id: "a",
				title: "Massive Attack - Teardrop",
				duration: 330.4,
				channel: "Someone",
			})("https://youtu.be/a"),
		).toEqual({
			title: "Teardrop",
			artists: ["Massive Attack"],
			durationMs: 330400,
			videoId: "a",
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
		).toMatchObject({ title: "Teardrop", artists: ["Massive Attack"] });
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
				youtubeId: "YmBN_ZzSD_8",
			}),
		).toMatchObject([{ ref: "YmBN_ZzSD_8", matchConfidence: 1 }]);
	});
});
