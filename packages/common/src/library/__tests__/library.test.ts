import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { probe } from "../../verify/audio";
import { libraryRelativePath } from "../layout";
import { downsampleToCap, placeFile, resolveLibraryPath } from "../place";
import { buildTags, type TrackMetadata } from "../tags";

const PYTHON = process.env.LYTERION_TEST_PYTHON ?? "python3";

function works(cmd: string, args: string[]): boolean {
	try {
		execFileSync(cmd, args, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}
const canTag =
	works("ffmpeg", ["-version"]) && works(PYTHON, ["-c", "import mutagen"]);

describe("libraryRelativePath", () => {
	const base = {
		albumArtist: "The Weeknd",
		artist: "The Weeknd",
		album: "After Hours",
		title: "Blinding Lights",
		year: "2020-03-20",
		trackNumber: 9,
		discNumber: 1,
		discTotal: 1,
		compilation: false,
		extension: "FLAC",
	};
	it.each([
		[base, "The Weeknd/After Hours (2020)/09 Blinding Lights.flac"],
		[
			{ ...base, discNumber: 2, discTotal: 2 },
			"The Weeknd/After Hours (2020)/2-09 Blinding Lights.flac",
		],
		[
			{
				...base,
				compilation: true,
				album: "Now 105",
				artist: "AC/DC",
				title: "T.N.T.",
			},
			"Compilations/Now 105 (2020)/09 AC_DC - T.N.T.flac",
		],
		[
			{ ...base, album: "What?: Live", year: null },
			"The Weeknd/What__ Live/09 Blinding Lights.flac",
		],
	])("%#", (input, expected) => {
		expect(libraryRelativePath(input)).toBe(expected);
	});
});

describe("resolveLibraryPath", () => {
	it("refuses anything that escapes the lyterion subtree (D-012)", () => {
		const options = { musicDir: "/music", librarySubdir: "lyterion" };
		expect(resolveLibraryPath(options, "A/B/01 C.flac")).toBe(
			"/music/lyterion/A/B/01 C.flac",
		);
		expect(() => resolveLibraryPath(options, "../Brad Sucks/x.flac")).toThrow(
			/outside/,
		);
	});
});

describe.skipIf(!canTag)("placeFile", () => {
	const dir = mkdtempSync(join(tmpdir(), "lyterion-place-"));
	const meta: TrackMetadata = {
		title: "Blinding Lights",
		artists: ["The Weeknd"],
		album: "After Hours",
		albumArtists: ["The Weeknd"],
		trackNumber: 9,
		trackTotal: 14,
		discNumber: 1,
		discTotal: 1,
		date: "2020-03-20",
		originalDate: "2020-03-20",
		releaseType: "Album",
		compilation: false,
		isrc: "USUG11904206",
		barcode: null,
		genres: ["synthpop"],
		mbRecordingId: "1a67e215-a19e-40c9-9b12-732de134bf5f",
		mbReleaseTrackId: null,
		mbReleaseId: null,
		mbReleaseGroupId: null,
		mbArtistIds: [],
		mbAlbumArtistIds: [],
		lyterionRecordingId: "rec_1",
		spotifyTrackId: "0VjIjW4GlUZAMYd2vXMi3b",
	};

	it("caps hi-res to 16/44.1, wipes junk tags, writes ours and moves atomically with a folder cover", async () => {
		const staged = join(dir, "staged.flac");
		const cover = join(dir, "cover-src.jpg");
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			"sine=d=3:r=96000",
			"-c:a",
			"flac",
			"-sample_fmt",
			"s32",
			"-metadata",
			"COMMENT=ripped by xX_uploader_Xx",
			staged,
		]);
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			"color=c=gray:s=1600x1600",
			"-frames:v",
			"1",
			cover,
		]);

		expect(
			await downsampleToCap(staged, await probe(staged), {
				musicDir: dir,
				librarySubdir: "lyterion",
			}),
		).toBe(true);
		const placed = await placeFile(
			{
				stagedPath: staged,
				relativePath: libraryRelativePath({
					...meta,
					albumArtist: "The Weeknd",
					artist: "The Weeknd",
					year: meta.date,
					extension: "flac",
				}),
				tags: buildTags(meta),
				coverPath: cover,
			},
			{
				musicDir: join(dir, "music"),
				librarySubdir: "lyterion",
				python: PYTHON,
			},
		);

		expect(placed).toBe(
			join(
				dir,
				"music/lyterion/The Weeknd/After Hours (2020)/09 Blinding Lights.flac",
			),
		);
		expect(existsSync(staged)).toBe(false);
		expect(
			existsSync(
				join(dir, "music/lyterion/The Weeknd/After Hours (2020)/cover.jpg"),
			),
		).toBe(true);
		const facts = await probe(placed);
		expect([facts.bitDepth, facts.sampleRateHz]).toEqual([16, 44_100]);
		const tags = JSON.parse(
			execFileSync("ffprobe", [
				"-v",
				"error",
				"-show_entries",
				"format_tags",
				"-of",
				"json",
				placed,
			]).toString(),
		).format.tags;
		const upper = Object.fromEntries(
			Object.entries(tags).map(([k, v]) => [k.toUpperCase(), v]),
		);
		expect(upper).toMatchObject({
			TITLE: "Blinding Lights",
			ISRC: "USUG11904206",
			MUSICBRAINZ_TRACKID: meta.mbRecordingId,
			LYTERION_RECORDING_ID: "rec_1",
		});
		expect(upper.COMMENT).toBeUndefined();
	});
});

describe.skipIf(!works("ffmpeg", ["-version"]))("downsampleToCap", () => {
	it("caps hi-res flac but never re-encodes 48 kHz opus to flac", async () => {
		const dir = mkdtempSync(join(tmpdir(), "lyterion-cap-"));
		const opus = join(dir, "yt.opus");
		const flac = join(dir, "hires.flac");
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			"sine=d=2:r=48000",
			"-c:a",
			"libopus",
			"-b:a",
			"128k",
			opus,
		]);
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			"sine=d=2:r=96000",
			"-c:a",
			"flac",
			flac,
		]);
		const options = { musicDir: dir, librarySubdir: "lyterion" };

		expect(await downsampleToCap(opus, await probe(opus), options)).toBe(false);
		expect((await probe(opus)).codec).toBe("opus");
		expect(await downsampleToCap(flac, await probe(flac), options)).toBe(true);
		expect((await probe(flac)).sampleRateHz).toBe(44_100);
	});
});
