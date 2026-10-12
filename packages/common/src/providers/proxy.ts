import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

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

// hifi-api style Tidal proxies (tidal-ui, SquidWTF); they die often, so a failing one cools down 15 min (#23, D-019).
const COOLDOWN_MS = 15 * 60_000;
const TIMEOUT_MS = 15_000;
const DURATION_TOLERANCE_S = 3;
const LOSSLESS_QUALITIES = new Set(["LOSSLESS", "HI_RES", "HI_RES_LOSSLESS"]);

export type ProxyTrack = {
	id: number | string;
	title: string;
	version?: string | null;
	duration?: number;
	isrc?: string;
	audioQuality?: string;
	artist?: { name?: string };
	artists?: { name?: string }[];
	album?: { title?: string };
};

export type ProxyRef = { backend: string; id: string };

export type ProxyOptions = {
	backends: string[];
	fetch?: typeof fetch;
	now?: () => number;
};

// Backends answer either {items} or a v2 wrapper {version, data: {items}}; take the first items array found.
export function findItems(body: unknown): ProxyTrack[] {
	if (!body || typeof body !== "object") return [];
	if (Array.isArray(body)) {
		for (const entry of body) {
			const found = findItems(entry);
			if (found.length > 0) return found;
		}
		return [];
	}
	const record = body as Record<string, unknown>;
	if (Array.isArray(record.items)) return record.items as ProxyTrack[];
	for (const value of Object.values(record)) {
		const found = findItems(value);
		if (found.length > 0) return found;
	}
	return [];
}

function findKey(body: unknown, key: string): unknown {
	if (!body || typeof body !== "object") return undefined;
	if (Array.isArray(body)) {
		for (const entry of body) {
			const found = findKey(entry, key);
			if (found !== undefined) return found;
		}
		return undefined;
	}
	const record = body as Record<string, unknown>;
	if (key in record) return record[key];
	for (const value of Object.values(record)) {
		const found = findKey(value, key);
		if (found !== undefined) return found;
	}
	return undefined;
}

/** A direct file url from a /track/ response: OriginalTrackUrl, else a single-file BTS manifest. */
export function streamUrl(body: unknown): { url: string; ext: string } {
	const direct =
		findKey(body, "OriginalTrackUrl") ?? findKey(body, "originalTrackUrl");
	const mime = String(findKey(body, "manifestMimeType") ?? "");
	const lossless = LOSSLESS_QUALITIES.has(
		String(findKey(body, "audioQuality") ?? ""),
	);
	if (typeof direct === "string")
		return { url: direct, ext: lossless ? "flac" : "m4a" };
	const manifest = findKey(body, "manifest");
	if (typeof manifest === "string" && mime.includes("vnd.tidal.bts")) {
		const decoded = JSON.parse(
			Buffer.from(manifest, "base64").toString("utf8"),
		) as {
			urls?: string[];
			codecs?: string;
		};
		const url = decoded.urls?.[0];
		if (url)
			return { url, ext: decoded.codecs?.includes("flac") ? "flac" : "m4a" };
	}
	throw new Error(`no single-file stream (manifest ${mime || "missing"})`);
}

export function trackToCandidate(
	target: RecordingTarget,
	backend: string,
	track: ProxyTrack,
): Candidate | null {
	const lossless = LOSSLESS_QUALITIES.has(track.audioQuality ?? "");
	const isrcMatch =
		!!track.isrc && target.isrcs.includes(track.isrc.toUpperCase());
	if (
		track.duration !== undefined &&
		Math.abs(track.duration - target.durationMs / 1000) > DURATION_TOLERANCE_S
	)
		return null;
	let matchConfidence = 1;
	if (!isrcMatch) {
		const wanted = parseTitle(target.title);
		const found = parseTitle(
			`${track.title}${track.version ? ` (${track.version})` : ""}`,
		);
		if (found.base !== wanted.base) return null;
		if (found.flags.join() !== wanted.flags.join()) return null;
		const artists = [
			track.artist?.name,
			...(track.artists ?? []).map((a) => a.name),
		]
			.filter((n): n is string => !!n)
			.map(normalizeArtist);
		if (!artists.includes(normalizeArtist(target.artists[0] ?? "")))
			return null;
		matchConfidence = 0.9;
	}
	const ref: ProxyRef = { backend, id: String(track.id) };
	return {
		providerId: "proxy",
		ref: JSON.stringify(ref),
		format: lossless ? "flac" : "aac",
		bitrateKbps: lossless ? undefined : 320,
		bitDepth: lossless ? 16 : undefined,
		sampleRateHz: lossless ? 44_100 : undefined,
		durationMs:
			track.duration !== undefined ? track.duration * 1000 : undefined,
		isrcMatch,
		matchConfidence,
		estimatedSeconds: 10,
	};
}

export function createProxyProvider(options: ProxyOptions): Provider {
	const backends = options.backends.map((b) => b.replace(/\/$/, ""));
	const doFetch = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const downUntil = new Map<string, number>();
	let cursor = 0;

	async function getJson(backend: string, route: string): Promise<unknown> {
		const res = await doFetch(`${backend}${route}`, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok) throw new Error(`${backend}${route}: HTTP ${res.status}`);
		return res.json();
	}

	// Start from a rotating index so load spreads; skip backends in cooldown.
	async function withBackend<T>(
		run: (backend: string) => Promise<T>,
	): Promise<T> {
		const errors: string[] = [];
		const order = backends.map(
			(_, i) => backends[(cursor + i) % backends.length] as string,
		);
		cursor = (cursor + 1) % Math.max(backends.length, 1);
		for (const backend of order) {
			if ((downUntil.get(backend) ?? 0) > now()) continue;
			try {
				return await run(backend);
			} catch (error) {
				downUntil.set(backend, now() + COOLDOWN_MS);
				errors.push(error instanceof Error ? error.message : String(error));
			}
		}
		throw new Error(
			`no proxy backend answered: ${errors.join("; ") || "all cooling down"}`,
		);
	}

	return {
		id: "proxy",
		kind: "catalog",
		phase: "B",

		async health(): Promise<ProviderHealth> {
			const started = now();
			const results = await Promise.allSettled(
				backends.map(async (backend) => {
					await getJson(backend, "/search/?s=test");
					downUntil.delete(backend);
				}),
			);
			const up = results.filter((r) => r.status === "fulfilled").length;
			results.forEach((r, i) => {
				if (r.status === "rejected")
					downUntil.set(backends[i] as string, now() + COOLDOWN_MS);
			});
			return {
				ok: up > 0,
				latencyMs: now() - started,
				detail: `${up}/${backends.length} up`,
			};
		},

		async search(target) {
			const query = `${target.artists[0] ?? ""} ${parseTitle(target.title).base}`;
			return withBackend(async (backend) => {
				const body = await getJson(
					backend,
					`/search/?s=${encodeURIComponent(normalizeText(query))}`,
				);
				return findItems(body)
					.flatMap((track) => trackToCandidate(target, backend, track) ?? [])
					.sort((a, b) => b.matchConfidence - a.matchConfidence);
			});
		},

		async fetch(candidate, stagingDir): Promise<FetchedFile> {
			const ref = JSON.parse(candidate.ref) as ProxyRef;
			const quality = candidate.format === "flac" ? "LOSSLESS" : "HIGH";
			// The searched backend first; the id is Tidal's, so any other backend can serve it too.
			const order = [ref.backend, ...backends.filter((b) => b !== ref.backend)];
			const errors: string[] = [];
			for (const backend of order) {
				if (backend !== ref.backend && (downUntil.get(backend) ?? 0) > now())
					continue;
				try {
					const stream = streamUrl(
						await getJson(
							backend,
							`/track/?id=${encodeURIComponent(ref.id)}&quality=${quality}`,
						),
					);
					const res = await doFetch(stream.url);
					if (!res.ok || !res.body)
						throw new Error(`stream HTTP ${res.status}`);
					await mkdir(stagingDir, { recursive: true });
					const dest = path.join(stagingDir, `${randomUUID()}.${stream.ext}`);
					await pipeline(
						Readable.fromWeb(
							res.body as Parameters<typeof Readable.fromWeb>[0],
						),
						createWriteStream(dest),
					);
					return { path: dest, candidate };
				} catch (error) {
					errors.push(
						`${backend}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
			throw new Error(`proxy fetch failed: ${errors.join("; ")}`);
		},
	};
}
