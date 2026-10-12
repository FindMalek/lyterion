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

function artistOf(entry: YtEntry): string {
	return (
		entry.artists?.[0] ??
		entry.artist ??
		(entry.channel ?? entry.uploader ?? "").replace(/\s+-\s+Topic$/, "")
	);
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
	const artistMatch =
		normalizeArtist(artistOf(entry)) ===
		normalizeArtist(target.artists[0] ?? "");
	return {
		providerId: "youtube",
		ref: entry.id,
		format: "opus",
		bitrateKbps: OPUS_KBPS,
		durationMs:
			entry.duration !== undefined ? entry.duration * 1000 : undefined,
		isrcMatch: false,
		// Topic channels are the label's own upload of the album track; still never certain without a fingerprint.
		matchConfidence: artistMatch ? 0.85 : 0.6,
		estimatedSeconds: 20,
	};
}

export function createYoutubeProvider(options: YoutubeOptions = {}): Provider {
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
	const run: RunYtDlp =
		options.run ??
		(async (args) => {
			const bin = await resolveYtDlp(options.binary);
			const { stdout } = await exec(bin, [...base, ...args], {
				maxBuffer: 32 * 1024 * 1024,
			});
			return stdout;
		});

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
				"-f",
				"bestaudio[acodec=opus]/bestaudio",
				"-x",
				"--audio-format",
				"opus",
				"--audio-quality",
				"0",
				"-o",
				path.join(dir, "%(id)s.%(ext)s"),
				`https://music.youtube.com/watch?v=${candidate.ref}`,
			]);
			const [file] = (await readdir(dir)).filter((f) => !f.endsWith(".part"));
			if (!file)
				throw new Error(`yt-dlp produced no file for ${candidate.ref}`);
			return { path: path.join(dir, file), candidate };
		},
	};
}
