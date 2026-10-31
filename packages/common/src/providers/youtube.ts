import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
	normalizeArtist,
	normalizeText,
	parseTitle,
} from "../identity/normalize";
import type {
	Candidate,
	FetchedFile,
	Provider,
	ProviderHealth,
	RecordingTarget,
} from "./types";

// Last resort (docs/providers.md, D-021): yt-dlp against YouTube Music, opus at ~160 kbps, always fingerprinted.
const SEARCH_LIMIT = 10;
const DURATION_TOLERANCE_S = 4;
const TOPIC_TOLERANCE_S = 2;
const OPUS_KBPS = 160;
const RELEASE_URL =
	"https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

export type YtEntry = {
	id: string;
	title: string;
	duration?: number;
	channel?: string;
	uploader?: string;
	artists?: string[];
	artist?: string;
	thumbnail?: string;
	webpage_url?: string;
};

export type RunYtDlp = (args: string[]) => Promise<string>;

export type YoutubeOptions = {
	cookiesPath?: string;
	potProviderUrl?: string;
	binary?: string;
	run?: RunYtDlp;
	// One yt-dlp call at a time across tasks, with jitter (docs/providers.md queue `youtube`).
	pace?: () => Promise<void>;
};

const exec = promisify(execFile);

async function exists(p: string) {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

// Debian's yt-dlp is too old for YouTube; the standalone release is fetched once when none is installed.
export async function resolveYtDlp(binary?: string): Promise<string> {
	if (binary) return binary;
	try {
		await exec("yt-dlp", ["--version"]);
		return "yt-dlp";
	} catch {}
	const cached = path.join(tmpdir(), "lyterion-yt-dlp");
	if (!(await exists(cached))) {
		const res = await fetch(RELEASE_URL);
		if (!res.ok)
			throw new Error(`could not download yt-dlp: HTTP ${res.status}`);
		await writeFile(cached, Buffer.from(await res.arrayBuffer()));
		await chmod(cached, 0o755);
	}
	return cached;
}

const TOPIC = /\s+-\s+Topic$/;

function artistOf(entry: YtEntry): string {
	return (
		entry.artists?.[0] ??
		entry.artist ??
		(entry.channel ?? entry.uploader ?? "").replace(TOPIC, "")
	);
}

function artistsOf(entry: YtEntry): string[] {
	const names = [
		...(entry.artists ?? []),
		...(entry.artist ? [entry.artist] : []),
		(entry.channel ?? entry.uploader ?? "").replace(TOPIC, ""),
	];
	return names.map(normalizeArtist).filter(Boolean);
}

export function entryToCandidate(
	target: RecordingTarget,
	entry: YtEntry,
): Candidate | null {
	if (
		entry.duration !== undefined &&
		Math.abs(entry.duration - target.durationMs / 1000) > DURATION_TOLERANCE_S
	)
		return null;
	const wanted = parseTitle(target.title);
	const found = parseTitle(entry.title);
	if (found.flags.join() !== wanted.flags.join()) return null;
	const titleTokens = wanted.base.split(" ").filter(Boolean);
	const hits = titleTokens.filter((t) =>
		found.base.split(" ").includes(t),
	).length;
	if (titleTokens.length === 0 || hits / titleTokens.length < 0.8) return null;
	const wantedArtists = target.artists.map(normalizeArtist);
	const artistMatch = artistsOf(entry).some((a) => wantedArtists.includes(a));
	// The label's own auto upload (#125): right artist, exact title, same length is as good as a fingerprint hit.
	const isTopic = TOPIC.test(entry.channel ?? entry.uploader ?? "");
	const labelMaster =
		isTopic &&
		artistMatch &&
		found.base === wanted.base &&
		entry.duration !== undefined &&
		Math.abs(entry.duration - target.durationMs / 1000) <= TOPIC_TOLERANCE_S;
	return {
		providerId: "youtube",
		ref: entry.id,
		format: "opus",
		bitrateKbps: OPUS_KBPS,
		durationMs:
			entry.duration !== undefined ? entry.duration * 1000 : undefined,
		isrcMatch: false,
		matchConfidence: labelMaster ? 0.95 : artistMatch ? 0.85 : 0.6,
		estimatedSeconds: 20,
	};
}

function makeRunner(options: YoutubeOptions): RunYtDlp {
	const base = [
		...(options.cookiesPath ? ["--cookies", options.cookiesPath] : []),
		...(options.potProviderUrl
			? [
					"--extractor-args",
					`youtubepot-bgutilhttp:base_url=${options.potProviderUrl}`,
				]
			: []),
		"--no-warnings",
		"--no-progress",
	];
	return (
		options.run ??
		(async (args) => {
			const bin = await resolveYtDlp(options.binary);
			const { stdout } = await exec(bin, [...base, ...args], {
				maxBuffer: 32 * 1024 * 1024,
			});
			return stdout;
		})
	);
}

export type YoutubeMeta = {
	/** Set when the input was a YouTube or SoundCloud link. */
	linkUrl?: string;
	coverUrl?: string;
	isrc?: string;
	source?: "youtube" | "soundcloud" | "deezer" | "search";
	title: string;
	artists: string[];
	durationMs: number;
};

const MEDIA_LINK =
	/^https?:\/\/((www|m|music|on)\.)?(youtube\.com|youtu\.be|soundcloud\.com|snd\.sc)\//i;

/** A link yt-dlp reads and downloads as is. */
/** Video id from a bare id or any youtube / youtu.be / music.youtube link, null for anything else. */
export function youtubeVideoId(ref: string): string | null {
	if (/^[\w-]{11}$/.test(ref)) return ref;
	const match = ref.match(
		/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i,
	);
	return match?.[1] ?? null;
}

/** Largest thumbnail first: maxres is missing on many uploads, hq always exists. */
export function youtubeThumbnailUrls(ref: string): string[] {
	const id = youtubeVideoId(ref);
	if (!id) return [];
	return ["maxresdefault", "hqdefault"].map(
		(size) => `https://i.ytimg.com/vi/${id}/${size}.jpg`,
	);
}

export function isMediaLink(input: string): boolean {
	return MEDIA_LINK.test(input.trim());
}

const NAME_HITS = 5;
const MIN_NAME_SCORE = 0.6;
const UPLOAD_NOISE =
	/\s*[([](?:official|audio|video|lyrics?|visuali[sz]er|prod\b|hd|hq)[^)\]]*[)\]]/gi;

/** "Artist - Title (Official Video)" as an upload names it: the title cleaned, the artist when the title carries one. */
export function parseUpload(raw: string): { title: string; artist?: string } {
	const title = raw.replace(UPLOAD_NOISE, "").trim();
	const split = title.match(/^(.+?)\s+-\s+(.+)$/);
	return split?.[1] && split[2]
		? { title: split[2], artist: split[1] }
		: { title };
}

function nameScore(query: string, entry: YtEntry): number {
	const wanted = normalizeText(query).split(" ").filter(Boolean);
	const found = new Set(
		normalizeText(`${artistOf(entry)} ${entry.title}`).split(" "),
	);
	if (wanted.length === 0) return 0;
	return wanted.filter((t) => found.has(t)).length / wanted.length;
}

/** What a pasted link or a typed name is, read from YouTube (best of the first hits for a name). */
export function createYoutubeLookup(options: YoutubeOptions = {}) {
	const run = makeRunner(options);
	const lines = (stdout: string) =>
		stdout
			.split("\n")
			.filter((l) => l.trim().startsWith("{"))
			.map((l) => JSON.parse(l) as YtEntry & { track?: string });
	return async (input: string): Promise<YoutubeMeta> => {
		const query = input.trim();
		let entry: (YtEntry & { track?: string }) | undefined;
		if (isMediaLink(query)) {
			entry = lines(
				await run(["--dump-json", "--no-playlist", "--skip-download", query]),
			)[0];
		} else {
			const hits = lines(
				await run([
					"--flat-playlist",
					"--dump-json",
					`ytsearch${NAME_HITS}:${query}`,
				]),
			).filter((e) => e.duration);
			// Max keeps the first of equal scores, so YouTube's own ranking breaks ties.
			entry = hits.reduce<YtEntry | undefined>(
				(best, e) =>
					!best || nameScore(query, e) > nameScore(query, best) ? e : best,
				undefined,
			);
			if (entry && nameScore(query, entry) < MIN_NAME_SCORE)
				throw new Error(`no confident match for "${query}"`);
		}
		if (!entry?.duration) throw new Error(`nothing found for "${query}"`);
		const artist = artistOf(entry);
		const title = entry.title.replace(UPLOAD_NOISE, "").trim();
		// Plain uploads carry "Artist - Title" in the title and no track field.
		const split = entry.track ? null : title.match(/^(.+?)\s+-\s+(.+)$/);
		const named = split?.[1] ?? artist;
		return {
			title: entry.track ?? split?.[2] ?? title,
			artists: named ? [named] : [],
			durationMs: Math.round(entry.duration * 1000),
			coverUrl:
				entry.thumbnail ?? `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`,
			...(isMediaLink(query)
				? {
						linkUrl: entry.webpage_url ?? query,
						source: /soundcloud|snd\.sc/i.test(query)
							? ("soundcloud" as const)
							: ("youtube" as const),
					}
				: {
						// The video the lookup found is the one to fetch, not whatever the provider's own search ranks first.
						linkUrl: `https://www.youtube.com/watch?v=${entry.id}`,
						source: "search" as const,
					}),
		};
	};
}

export function createYoutubeProvider(options: YoutubeOptions = {}): Provider {
	const run = makeRunner(options);

	return {
		id: "youtube",
		kind: "video",
		phase: "D",

		async health(): Promise<ProviderHealth> {
			const started = Date.now();
			const version = (await run(["--version"])).trim();
			return {
				ok: version.length > 0,
				latencyMs: Date.now() - started,
				detail: `yt-dlp ${version}`,
			};
		},

		async search(target) {
			if (target.linkUrl)
				return [
					{
						providerId: "youtube",
						ref: target.linkUrl,
						format: "opus",
						bitrateKbps: OPUS_KBPS,
						durationMs: target.durationMs,
						isrcMatch: false,
						matchConfidence: 1,
						estimatedSeconds: 20,
					},
				];
			const query = normalizeText(
				`${target.artists[0] ?? ""} ${parseTitle(target.title).base}`,
			);
			await options.pace?.();
			const stdout = await run([
				"--flat-playlist",
				"--dump-json",
				"--playlist-end",
				String(SEARCH_LIMIT),
				`https://music.youtube.com/search?q=${encodeURIComponent(query)}#songs`,
			]);
			return stdout
				.split("\n")
				.filter((line) => line.trim().startsWith("{"))
				.flatMap(
					(line) => entryToCandidate(target, JSON.parse(line) as YtEntry) ?? [],
				)
				.sort((a, b) => b.matchConfidence - a.matchConfidence);
		},

		async fetch(candidate, stagingDir): Promise<FetchedFile> {
			const dir = path.join(stagingDir, `yt-${randomUUID()}`);
			await mkdir(dir, { recursive: true });
			await options.pace?.();
			// Opus stays opus (no re-encode); anything else is extracted as the best audio available.
			await run([
				"--no-playlist",
				"-f",
				"bestaudio[acodec=opus]/bestaudio",
				"-x",
				"--audio-format",
				"opus",
				"--audio-quality",
				"0",
				"-o",
				path.join(dir, "%(id)s.%(ext)s"),
				candidate.ref.startsWith("http")
					? candidate.ref
					: `https://music.youtube.com/watch?v=${candidate.ref}`,
			]);
			const [file] = (await readdir(dir)).filter((f) => !f.endsWith(".part"));
			if (!file)
				throw new Error(`yt-dlp produced no file for ${candidate.ref}`);
			return { path: path.join(dir, file), candidate };
		},
	};
}
