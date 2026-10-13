import { describe, expect, it } from "vitest";

import {
	albumLoudnessArgs,
	fetchLyrics,
	lrcPath,
	parseEbur128,
	replayGainTags,
	sameSong,
} from "../extras";

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

describe("album gain", () => {
	it("concatenates every track, resampled, before ebur128", () => {
		expect(albumLoudnessArgs(["a.flac", "b.mp3"])).toEqual([
			"-i",
			"a.flac",
			"-i",
			"b.mp3",
			"-filter_complex",
			"[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0];[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a1];[a0][a1]concat=n=2:v=0:a=1,ebur128=peak=true",
		]);
	});

	it("writes album keys", () => {
		expect(
			replayGainTags({ integratedLufs: -25, truePeakDb: -13.5 }, "ALBUM"),
		).toEqual({
			REPLAYGAIN_ALBUM_GAIN: ["7.00 dB"],
			REPLAYGAIN_ALBUM_PEAK: ["0.211349"],
		});
	});
});

describe("lyrics lookup order", () => {
	const q = {
		artist: "Massive Attack",
		title: "Teardrop",
		album: "Mezzanine (Deluxe Edition)",
		durationMs: 330_000,
	};

	function lrclib(routes: Record<string, unknown>) {
		const urls: string[] = [];
		const doFetch = (async (input: string) => {
			urls.push(input);
			const url = new URL(input);
			const key =
				url.pathname === "/api/search"
					? "search"
					: url.searchParams.has("album_name")
						? "get+album"
						: "get";
			const body = routes[key];
			return body === undefined
				? Response.json({}, { status: 404 })
				: Response.json(body);
		}) as unknown as typeof fetch;
		return { doFetch, urls };
	}

	it("retries without the album when the exact match misses", async () => {
		const { doFetch, urls } = lrclib({ get: { syncedLyrics: "[00:01.00] a" } });
		expect(await fetchLyrics(q, doFetch)).toBe("[00:01.00] a");
		expect(urls).toHaveLength(2);
	});

	it("falls back to search and keeps only the same song, synced first", async () => {
		const { doFetch } = lrclib({
			search: [
				{
					trackName: "Teardrop (Live)",
					artistName: "Massive Attack",
					duration: 330,
					syncedLyrics: "live",
				},
				{
					trackName: "Teardrop",
					artistName: "Massive Attack",
					duration: 345,
					syncedLyrics: "long edit",
				},
				{
					trackName: "Teardrop",
					artistName: "Massive Attack",
					duration: 331,
					plainLyrics: "plain",
				},
				{
					trackName: "Teardrop - Remastered",
					artistName: "Massive Attack, Elizabeth Fraser",
					duration: 329,
					syncedLyrics: "[00:02.00] b",
				},
			],
		});
		expect(await fetchLyrics(q, doFetch)).toBe("[00:02.00] b");
	});

	it("returns null when nothing matches", async () => {
		const { doFetch } = lrclib({
			search: [
				{
					trackName: "Angel",
					artistName: "Massive Attack",
					duration: 330,
					syncedLyrics: "x",
				},
			],
		});
		expect(await fetchLyrics(q, doFetch)).toBeNull();
	});

	it("matches title and artist after normalizing, within 2s", () => {
		expect(
			sameSong(q, {
				trackName: "TEARDROP",
				artistName: "massive attack",
				duration: 332,
			}),
		).toBe(true);
		expect(
			sameSong(q, {
				trackName: "Teardrop",
				artistName: "Massive Attack",
				duration: 333,
			}),
		).toBe(false);
		expect(
			sameSong(q, {
				trackName: "Teardrop",
				artistName: "Portishead",
				duration: 330,
			}),
		).toBe(false);
	});
});
