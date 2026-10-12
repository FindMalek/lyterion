import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

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

/** LRCLIB synced lyrics, else plain; null for instrumentals and misses. */
export async function fetchLyrics(
	query: LrclibQuery,
	doFetch: typeof fetch = fetch,
): Promise<string | null> {
	const params = new URLSearchParams({
		artist_name: query.artist,
		track_name: query.title,
		duration: String(Math.round(query.durationMs / 1000)),
	});
	if (query.album) params.set("album_name", query.album);
	const res = await doFetch(`https://lrclib.net/api/get?${params}`, {
		headers: {
			"User-Agent": "Lyterion (https://github.com/FindMalek/lyterion)",
		},
		signal: AbortSignal.timeout(10_000),
	});
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`lrclib ${res.status}`);
	const body = (await res.json()) as {
		instrumental?: boolean;
		syncedLyrics?: string | null;
		plainLyrics?: string | null;
	};
	if (body.instrumental) return null;
	return body.syncedLyrics?.trim() || body.plainLyrics?.trim() || null;
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
