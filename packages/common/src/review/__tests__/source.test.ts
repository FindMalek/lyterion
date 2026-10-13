import { describe, expect, it } from "vitest";

import { candidateSource } from "../source";

describe("candidateSource", () => {
	it("links catalog sources and gives Soulseek something to copy", () => {
		expect(candidateSource("youtube", "u7K72X4eo_s")).toEqual({
			url: "https://music.youtube.com/watch?v=u7K72X4eo_s",
			copy: null,
		});
		expect(
			candidateSource(
				"proxy",
				JSON.stringify({ backend: "https://x", id: "1234" }),
			),
		).toEqual({ url: "https://tidal.com/browse/track/1234", copy: null });
		expect(
			candidateSource(
				"slskd",
				JSON.stringify({
					username: "musicfan",
					filename: "Music\\Teardrop.flac",
					size: 1,
				}),
			),
		).toEqual({ url: null, copy: "musicfan Music\\Teardrop.flac" });
		expect(candidateSource("lidarr", "/downloads/a.flac")).toEqual({
			url: null,
			copy: "/downloads/a.flac",
		});
	});
});
