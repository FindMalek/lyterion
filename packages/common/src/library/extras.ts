import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { normalizeArtist, parseTitle } from "../identity/normalize";

const run = promisify(execFile);

// ReplayGain 2.0 reference loudness; same numbers rsgain writes for the beets side (D-020).
const RG_REFERENCE_LUFS = -18;

export type Loudness = { integratedLufs: number; truePeakDb: number };

export function parseEbur128(stderr: string): Loudness | null {
	const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
	const integrated = summary.match(/I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/);
	const peak = summary.match(/Peak:\s+(-?(?:\d+(?:\.\d+)?|inf))\s+dBFS/);
	if (!integrated?.[1]) return null;
	return {
		integratedLufs: Number(integrated[1]),
		truePeakDb:
			peak?.[1] && peak[1] !== "-inf"
				? Number(peak[1])
				: Number.NEGATIVE_INFINITY,
	};
}

export function replayGainTags(
	loudness: Loudness,
	scope: "TRACK" | "ALBUM" = "TRACK",
): Record<string, string[]> {
	const gain = RG_REFERENCE_LUFS - loudness.integratedLufs;
	const peak = Number.isFinite(loudness.truePeakDb)
		? 10 ** (loudness.truePeakDb / 20)
		: 0;
	return {
		[`REPLAYGAIN_${scope}_GAIN`]: [`${gain.toFixed(2)} dB`],
		[`REPLAYGAIN_${scope}_PEAK`]: [peak.toFixed(6)],
	};
}

export async function measureLoudness(path: string): Promise<Loudness | null> {
	return measureAlbumLoudness([path]);
}

// Album gain is the loudness of the tracks played back to back; inputs are resampled so concat accepts mixed formats.
export function albumLoudnessArgs(paths: string[]): string[] {
	if (paths.length === 1)
		return ["-i", paths[0] as string, "-af", "ebur128=peak=true"];
	const inputs = paths.flatMap((p) => ["-i", p]);
	const prepared = paths
		.map(
			(_, i) =>
				`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
		)
		.join(";");
	const joined = paths.map((_, i) => `[a${i}]`).join("");
	return [
		...inputs,
		"-filter_complex",
		`${prepared};${joined}concat=n=${paths.length}:v=0:a=1,ebur128=peak=true`,
	];
}

export async function measureAlbumLoudness(
	paths: string[],
): Promise<Loudness | null> {
	if (paths.length === 0) return null;
	const { stderr } = await run(
		"ffmpeg",
		[
			"-hide_banner",
			"-nostats",
			...albumLoudnessArgs(paths),
			"-f",
			"null",
			"-",
		],
		{ maxBuffer: 64 * 1024 * 1024 },
	);
	return parseEbur128(stderr);
}

export type LrclibQuery = {
	artist: string;
	title: string;
	album: string | null;
	durationMs: number;
};

type LrclibRecord = {
	trackName?: string;
	artistName?: string;
	duration?: number;
	instrumental?: boolean;
	syncedLyrics?: string | null;
	plainLyrics?: string | null;
};

const LRCLIB = "https://lrclib.net/api";
const LRCLIB_HEADERS = {
	"User-Agent": "Lyterion (https://github.com/FindMalek/lyterion)",
};
// LRCLIB's own /get tolerance; a wider gap is usually a different edit with different timings.
const DURATION_TOLERANCE_S = 2;

function lyricsOf(record: LrclibRecord): string | null {
	if (record.instrumental) return null;
	return record.syncedLyrics?.trim() || record.plainLyrics?.trim() || null;
}

// LRCLIB joins performers into one string ("A, B", "A feat. B", "A & B"); the lead is the part before the first separator.
export function firstArtist(name: string): string {
	return (
		name.split(
			/\s*(?:,|;|&|\/|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\bx\b)\s*/i,
		)[0] ?? ""
	);
}

/** True when a search hit is the same song: same title, version (live, remix…) and first artist after normalizing, length within 2s. */
export function sameSong(query: LrclibQuery, record: LrclibRecord): boolean {
	if (record.duration == null) return false;
	if (
		Math.abs(record.duration - query.durationMs / 1000) > DURATION_TOLERANCE_S
	)
		return false;
	const title = parseTitle(query.title);
	const found = parseTitle(record.trackName ?? "");
	if (!title.base || title.base !== found.base) return false;
	if ([...title.flags].sort().join() !== [...found.flags].sort().join())
		return false;
	return (
		normalizeArtist(firstArtist(record.artistName ?? "")) ===
		normalizeArtist(firstArtist(query.artist))
	);
}

/** LRCLIB synced lyrics, else plain: exact match, then without the album (Spotify's rarely matches), then a search filtered by sameSong. */
export async function fetchLyrics(
	query: LrclibQuery,
	doFetch: typeof fetch = fetch,
	pace?: () => Promise<void>,
): Promise<string | null> {
	async function call(url: string): Promise<unknown | null> {
		await pace?.();
		const res = await doFetch(url, {
			headers: LRCLIB_HEADERS,
			signal: AbortSignal.timeout(10_000),
		});
		if (res.status === 404) return null;
		if (!res.ok) throw new Error(`lrclib ${res.status}`);
		return res.json();
	}
	const base = {
		artist_name: query.artist,
		track_name: query.title,
		duration: String(Math.round(query.durationMs / 1000)),
	};
	const attempts = query.album
		? [{ ...base, album_name: query.album }, base]
		: [base];
	for (const params of attempts) {
		const record = (await call(
			`${LRCLIB}/get?${new URLSearchParams(params)}`,
		)) as LrclibRecord | null;
		if (record) return lyricsOf(record);
	}
	const hits = (await call(
		`${LRCLIB}/search?${new URLSearchParams({ track_name: query.title, artist_name: query.artist })}`,
	)) as LrclibRecord[] | null;
	const matches = (hits ?? []).filter((h) => sameSong(query, h));
	const best =
		matches.find((h) => !h.instrumental && h.syncedLyrics?.trim()) ??
		matches.find((h) => !h.instrumental && h.plainLyrics?.trim());
	return best ? lyricsOf(best) : null;
}

export function lrcPath(audioPath: string): string {
	return audioPath.replace(/\.[^./]+$/, ".lrc");
}

export async function writeLyrics(
	audioPath: string,
	lyrics: string,
): Promise<string> {
	const path = lrcPath(audioPath);
	await writeFile(`${path}.tmp`, `${lyrics}\n`, "utf8");
	const { rename } = await import("node:fs/promises");
	await rename(`${path}.tmp`, path);
	return path;
}
