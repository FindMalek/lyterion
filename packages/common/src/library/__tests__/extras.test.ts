import { describe, expect, it } from "vitest";

import { fetchLyrics, lrcPath, parseEbur128, replayGainTags } from "../extras";

const STDERR = `[Parsed_ebur128_0 @ 0x1] t: 1.0  M: -20.1 S:-120.7 I: -20.1 LUFS LRA: 0.0 LU
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -14.2 LUFS
    Threshold: -24.5 LUFS

  Loudness range:
    LRA:         5.3 LU

  True peak:
    Peak:       -0.4 dBFS`;

describe("replaygain", () => {
	it("reads the ebur128 summary and turns it into ReplayGain 2.0 tags", () => {
		const loudness = parseEbur128(STDERR);
		expect(loudness).toEqual({ integratedLufs: -14.2, truePeakDb: -0.4 });
		expect(replayGainTags(loudness as never)).toEqual({
			REPLAYGAIN_TRACK_GAIN: ["-3.80 dB"],
			REPLAYGAIN_TRACK_PEAK: ["0.954993"],
		});
		expect(parseEbur128("no summary")).toBeNull();
	});
});

describe("lyrics", () => {
	it("prefers synced lyrics, falls back to plain, and skips instrumentals and misses", async () => {
		const reply = (body: unknown, status = 200) =>
			(async () => Response.json(body, { status })) as unknown as typeof fetch;
		const q = {
			artist: "Massive Attack",
			title: "Teardrop",
			album: "Mezzanine",
			durationMs: 330_000,
		};
		expect(
			await fetchLyrics(
				q,
				reply({ syncedLyrics: "[00:01.00] love", plainLyrics: "love" }),
			),
		).toBe("[00:01.00] love");
		expect(
			await fetchLyrics(q, reply({ syncedLyrics: null, plainLyrics: "love" })),
		).toBe("love");
		expect(await fetchLyrics(q, reply({ instrumental: true }))).toBeNull();
		expect(await fetchLyrics(q, reply({}, 404))).toBeNull();
		expect(lrcPath("/m/a/01 Teardrop.flac")).toBe("/m/a/01 Teardrop.lrc");
	});
});
