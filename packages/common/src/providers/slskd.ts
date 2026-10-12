import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import {
	normalizeArtist,
	normalizeText,
	parseTitle,
} from "../identity/normalize";
import type {
	AudioFormat,
	Candidate,
	FetchedFile,
	Provider,
	ProviderHealth,
	RecordingTarget,
} from "./types";

// slskd REST (/api/v0), docs/providers.md § slskd. Soulseek penalizes search floods, so searches are paced.
const MIN_SEARCH_GAP_MS = 5_000;
const SEARCH_TIMEOUT_MS = 15_000;
const POLL_MS = 1_000;
const DURATION_TOLERANCE_S = 3;
const MAX_CANDIDATES = 20;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

const FORMATS: Record<string, AudioFormat> = {
	flac: "flac",
	mp3: "mp3",
	m4a: "aac",
	aac: "aac",
	ogg: "vorbis",
	opus: "opus",
	wav: "wav",
	alac: "alac",
};

export type SlskdFile = {
	filename: string;
	size: number;
	bitRate?: number;
	bitDepth?: number;
	sampleRate?: number;
	length?: number;
	isLocked?: boolean;
};

export type SlskdResponse = {
	username: string;
	hasFreeUploadSlot: boolean;
	queueLength: number;
	uploadSpeed: number;
	files: SlskdFile[];
};

type TransferFile = {
	filename: string;
	state: string;
	bytesTransferred?: number;
	size?: number;
};

export type SlskdRef = { username: string; filename: string; size: number };

export type SlskdOptions = {
	url: string;
	apiKey: string;
	downloadsDir: string;
	fetch?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
};

export type ReleaseTarget = {
	artist: string;
	album: string;
	tracks: RecordingTarget[];
};

const defaultSleep = (ms: number) =>
	new Promise<void>((r) => setTimeout(r, ms));

function tokens(value: string): string[] {
	return value.split(" ").filter((t) => t.length > 0);
}

// Soulseek paths use backslashes; the last segment is the file, the one before is its folder.
export function splitSoulseekPath(filename: string): {
	dir: string;
	base: string;
} {
	const parts = filename.split(/[\\/]/).filter(Boolean);
	return { base: parts.at(-1) ?? filename, dir: parts.at(-2) ?? "" };
}

function stripTrackNumber(base: string): string {
	return base
		.replace(/\.[^.]+$/, "")
		.replace(/^\s*(?:\d{1,2}[-.]?)?\d{1,3}\s*[-._)]?\s*/, "");
}

export function searchQuery(target: RecordingTarget): string {
	const artist = normalizeArtist(target.artists[0] ?? "");
	return `${artist} ${parseTitle(target.title).base}`.trim();
}

/** 0..1 for how well a shared file matches the target; 0 rejects it. */
export function fileMatch(target: RecordingTarget, file: SlskdFile): number {
	const { base, dir } = splitSoulseekPath(file.filename);
	const wanted = parseTitle(target.title);
	const found = parseTitle(stripTrackNumber(base));
	// A live take or remix is a different recording (D-006).
	if (found.flags.some((flag) => !wanted.flags.includes(flag))) return 0;
	if (file.length !== undefined) {
		if (Math.abs(file.length - target.durationMs / 1000) > DURATION_TOLERANCE_S)
			return 0;
	}
	const haystack = normalizeText(`${dir} ${found.base}`);
	const titleTokens = tokens(wanted.base);
	if (titleTokens.length === 0) return 0;
	const titleHits = titleTokens.filter((t) =>
		tokens(found.base).includes(t),
	).length;
	if (titleHits / titleTokens.length < 0.8) return 0;
	const artist = normalizeArtist(target.artists[0] ?? "");
	const artistHit =
		artist === "" ||
		` ${normalizeText(file.filename)} `.includes(` ${artist} `);
	let score = 0.5 + 0.3 * (titleHits / titleTokens.length);
	if (artistHit) score += 0.1;
	if (file.length !== undefined) score += 0.05;
	if (haystack.includes(normalizeText(target.album ?? "\u0000"))) score += 0.05;
	// Never 1.0: fuzzy P2P matches go through the picker and fingerprinting (D-011).
	return Math.min(score, 0.95);
}

function formatOf(filename: string): AudioFormat | null {
	const ext = filename.split(".").at(-1)?.toLowerCase() ?? "";
	return FORMATS[ext] ?? null;
}

export function toCandidate(
	target: RecordingTarget,
	response: SlskdResponse,
	file: SlskdFile,
): Candidate | null {
	if (file.isLocked) return null;
	const format = formatOf(file.filename);
	if (!format) return null;
	const matchConfidence = fileMatch(target, file);
	if (matchConfidence === 0) return null;
	const lossless = format === "flac" || format === "wav" || format === "alac";
	const seconds = file.length ?? target.durationMs / 1000;
	const bitrateKbps =
		file.bitRate ??
		(lossless ? undefined : Math.round((file.size * 8) / seconds / 1000));
	const transfer =
		response.uploadSpeed > 0 ? file.size / response.uploadSpeed : 600;
	const queue = response.hasFreeUploadSlot
		? 0
		: (response.queueLength + 1) * 60;
	const ref: SlskdRef = {
		username: response.username,
		filename: file.filename,
		size: file.size,
	};
	return {
		providerId: "slskd",
		ref: JSON.stringify(ref),
		format,
		bitrateKbps,
		bitDepth: file.bitDepth,
		sampleRateHz: file.sampleRate,
		durationMs: file.length !== undefined ? file.length * 1000 : undefined,
		isrcMatch: false,
		matchConfidence,
		estimatedSeconds: Math.round(queue + transfer),
	};
}

export function createSlskdProvider(options: SlskdOptions): Provider & {
	searchRelease(release: ReleaseTarget): Promise<Map<string, Candidate[]>>;
} {
	const base = options.url.replace(/\/$/, "");
	const doFetch = options.fetch ?? fetch;
	const sleep = options.sleep ?? defaultSleep;
	const now = options.now ?? Date.now;
	let lastSearchAt = Number.NEGATIVE_INFINITY;

	async function api<T>(route: string, init: RequestInit = {}): Promise<T> {
		const res = await doFetch(`${base}/api/v0${route}`, {
			...init,
			headers: {
				"X-API-Key": options.apiKey,
				"Content-Type": "application/json",
				...init.headers,
			},
		});
		if (!res.ok)
			throw new Error(
				`slskd ${init.method ?? "GET"} ${route}: HTTP ${res.status}`,
			);
		const text = await res.text();
		return (text ? JSON.parse(text) : null) as T;
	}

	async function runSearch(searchText: string): Promise<SlskdResponse[]> {
		const wait = lastSearchAt + MIN_SEARCH_GAP_MS - now();
		if (wait > 0) await sleep(wait);
		lastSearchAt = now();
		const id = randomUUID();
		await api("/searches", {
			method: "POST",
			body: JSON.stringify({
				id,
				searchText,
				searchTimeout: SEARCH_TIMEOUT_MS,
			}),
		});
		try {
			const deadline = now() + SEARCH_TIMEOUT_MS + 5_000;
			while (now() < deadline) {
				const state = await api<{ isComplete: boolean }>(`/searches/${id}`);
				if (state.isComplete) break;
				await sleep(POLL_MS);
			}
			return await api<SlskdResponse[]>(`/searches/${id}/responses`);
		} finally {
			await api(`/searches/${id}`, { method: "DELETE" }).catch(() => undefined);
		}
	}

	function candidatesFor(target: RecordingTarget, responses: SlskdResponse[]) {
		return responses
			.flatMap((response) =>
				response.files.flatMap(
					(file) => toCandidate(target, response, file) ?? [],
				),
			)
			.sort((a, b) => b.matchConfidence - a.matchConfidence)
			.slice(0, MAX_CANDIDATES);
	}

	return {
		id: "slskd",
		kind: "p2p",
		phase: "C",

		async health(): Promise<ProviderHealth> {
			const started = now();
			const app = await api<{
				server?: { isConnected?: boolean; isLoggedIn?: boolean };
			}>("/application");
			const ok = Boolean(app.server?.isConnected && app.server?.isLoggedIn);
			return {
				ok,
				latencyMs: now() - started,
				detail: ok ? undefined : "not logged in to soulseek",
			};
		},

		async search(target) {
			return candidatesFor(target, await runSearch(searchQuery(target)));
		},

		// Album mode: one search for the whole release instead of one per track.
		async searchRelease(release) {
			const responses = await runSearch(
				`${normalizeArtist(release.artist)} ${normalizeText(release.album)}`,
			);
			return new Map(
				release.tracks.map((track) => [
					track.recordingId,
					candidatesFor(track, responses),
				]),
			);
		},

		async fetch(candidate, stagingDir): Promise<FetchedFile> {
			const ref = JSON.parse(candidate.ref) as SlskdRef;
			const user = encodeURIComponent(ref.username);
			await api(`/transfers/downloads/${user}`, {
				method: "POST",
				body: JSON.stringify([{ filename: ref.filename, size: ref.size }]),
			});
			const deadline = now() + DOWNLOAD_TIMEOUT_MS;
			let done = false;
			while (!done && now() < deadline) {
				const transfers = await api<{
					directories?: { files: TransferFile[] }[];
				}>(`/transfers/downloads/${user}`);
				const file = transfers.directories
					?.flatMap((d) => d.files)
					.find((f) => f.filename === ref.filename);
				if (file?.state.includes("Succeeded")) {
					done = true;
					break;
				}
				if (
					file &&
					/Errored|Rejected|Cancelled|TimedOut|Failed/.test(file.state)
				)
					throw new Error(`slskd download ${file.state}: ${ref.filename}`);
				await sleep(POLL_MS * 5);
			}
			if (!done) throw new Error(`slskd download timed out: ${ref.filename}`);
			// slskd writes to <downloads>/<remote folder>/<file name>.
			const { dir, base: name } = splitSoulseekPath(ref.filename);
			const source = path.join(options.downloadsDir, dir, name);
			await mkdir(stagingDir, { recursive: true });
			const dest = path.join(stagingDir, `${randomUUID()}-${name}`);
			await copyFile(source, dest);
			await rm(source, { force: true });
			return { path: dest, candidate };
		},
	};
}
