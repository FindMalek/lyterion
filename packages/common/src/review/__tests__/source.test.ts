import { describe, expect, it } from "vitest";

import { candidateSource, pickState } from "../source";

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

describe("pickState", () => {
	const now = 10 * 3600_000;
	it("hides a fresh pick, shows a stale one, and surfaces a failure", () => {
		expect(pickState(null, now)).toEqual({ hidden: false, lastError: null });
		expect(pickState(`picking:7:${now - 60_000}`, now)).toEqual({
			hidden: true,
			lastError: null,
		});
		expect(pickState(`picking:7:${now - 3 * 3600_000}`, now).hidden).toBe(
			false,
		);
		expect(
			pickState("failed:picked file failed verification: corrupt", now),
		).toEqual({
			hidden: false,
			lastError: "picked file failed verification: corrupt",
		});
	});
});
