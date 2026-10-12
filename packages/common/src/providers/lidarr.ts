import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
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

// Lidarr v1 API (#40): album-level grabs only. Lyterion asks for an album, Lidarr imports it, and this provider copies tracks out.
const TIMEOUT_MS = 15_000;
const DURATION_TOLERANCE_MS = 3_000;

export type LidarrOptions = {
	url: string;
	apiKey: string;
	// Lidarr's root folder as Lidarr sees it, and where the same folder is mounted in the worker.
	lidarrRoot?: string;
	localRoot?: string;
	fetch?: typeof fetch;
};

export type LidarrAlbum = {
	id?: number;
	title: string;
	foreignAlbumId: string;
	monitored?: boolean;
	artist?: { artistName: string; foreignArtistId: string } & Record<
		string,
		unknown
	>;
	statistics?: { trackFileCount?: number; trackCount?: number };
} & Record<string, unknown>;

type LidarrTrack = {
	title: string;
	duration: number;
	trackFileId: number;
	hasFile: boolean;
};

type LidarrTrackFile = {
	id: number;
	path: string;
	mediaInfo?: {
		audioBitrate?: number | string;
		audioBits?: number | string;
		audioSampleRate?: number | string;
	};
};

export type AlbumQuery = { artist: string; album: string };

const FORMATS: Record<string, AudioFormat> = {
	".flac": "flac",
	".m4a": "aac",
	".mp3": "mp3",
	".ogg": "vorbis",
	".opus": "opus",
	".wav": "wav",
};

function numberOrUndefined(value: number | string | undefined) {
	const n = typeof value === "string" ? Number.parseFloat(value) : value;
	return n !== undefined && Number.isFinite(n) && n > 0 ? n : undefined;
}

export function albumMatches(album: LidarrAlbum, query: AlbumQuery): boolean {
	return (
		normalizeText(album.title) === normalizeText(query.album) &&
		normalizeArtist(album.artist?.artistName ?? "") ===
			normalizeArtist(query.artist)
	);
}

/** 0..1 for a Lidarr track against the target; the album already matched, so title and duration decide. */
export function trackMatch(
	target: RecordingTarget,
	track: LidarrTrack,
): number {
	const wanted = parseTitle(target.title);
	const got = parseTitle(track.title);
	if (wanted.base !== got.base) return 0;
	if ([...wanted.flags].sort().join() !== [...got.flags].sort().join())
		return 0;
	if (Math.abs(track.duration - target.durationMs) > DURATION_TOLERANCE_MS)
		return 0;
	return 0.95;
}

export function createLidarrClient(options: LidarrOptions) {
	const base = options.url.replace(/\/$/, "");
	const doFetch = options.fetch ?? fetch;

	async function api<T>(route: string, init: RequestInit = {}): Promise<T> {
		const res = await doFetch(`${base}/api/v1${route}`, {
			...init,
			headers: {
				"X-Api-Key": options.apiKey,
				"Content-Type": "application/json",
				...init.headers,
			},
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok)
			throw new Error(
				`lidarr ${init.method ?? "GET"} ${route}: HTTP ${res.status}`,
			);
		return (await res.json()) as T;
	}

	return {
		status: () => api<{ version: string }>("/system/status"),

		async findAlbum(query: AlbumQuery): Promise<LidarrAlbum | null> {
			const term = encodeURIComponent(`${query.artist} ${query.album}`);
			const found = await api<LidarrAlbum[]>(`/album/lookup?term=${term}`);
			return found.find((a) => albumMatches(a, query)) ?? null;
		},

		async libraryAlbum(foreignAlbumId: string): Promise<LidarrAlbum | null> {
			const found = await api<LidarrAlbum[]>(
				`/album?foreignAlbumId=${encodeURIComponent(foreignAlbumId)}`,
			);
			return found[0] ?? null;
		},

		// Adds the album (and its artist, unmonitored otherwise) and lets Lidarr search for it right away.
		async requestAlbum(album: LidarrAlbum): Promise<LidarrAlbum> {
			const existing = await this.libraryAlbum(album.foreignAlbumId);
			if (existing?.id) {
				if (!existing.monitored)
					await api("/album/monitor", {
						method: "PUT",
						body: JSON.stringify({ albumIds: [existing.id], monitored: true }),
					});
				await api("/command", {
					method: "POST",
					body: JSON.stringify({
						name: "AlbumSearch",
						albumIds: [existing.id],
					}),
				});
				return existing;
			}
			const [root, quality, metadata] = await Promise.all([
				api<{ path: string }[]>("/rootfolder"),
				api<{ id: number }[]>("/qualityprofile"),
				api<{ id: number }[]>("/metadataprofile"),
			]);
			if (!root[0] || !quality[0] || !metadata[0])
				throw new Error("lidarr has no root folder or profiles set up");
			return api<LidarrAlbum>("/album", {
				method: "POST",
				body: JSON.stringify({
					...album,
					monitored: true,
					artist: {
						...album.artist,
						rootFolderPath: root[0].path,
						qualityProfileId: quality[0].id,
						metadataProfileId: metadata[0].id,
						monitored: true,
						addOptions: { monitor: "none", searchForMissingAlbums: false },
					},
					addOptions: { searchForNewAlbum: true },
				}),
			});
		},

		async albumTracks(albumId: number) {
			const [tracks, files] = await Promise.all([
				api<LidarrTrack[]>(`/track?albumId=${albumId}`),
				api<LidarrTrackFile[]>(`/trackfile?albumId=${albumId}`),
			]);
			const fileById = new Map(files.map((f) => [f.id, f]));
			return tracks.flatMap((t) => {
				const file = t.hasFile ? fileById.get(t.trackFileId) : undefined;
				return file ? [{ track: t, file }] : [];
			});
		},
	};
}

export type LidarrClient = ReturnType<typeof createLidarrClient>;

export function localPath(
	lidarrPath: string,
	options: Pick<LidarrOptions, "lidarrRoot" | "localRoot">,
): string {
	const { lidarrRoot, localRoot } = options;
	if (!lidarrRoot || !localRoot || !lidarrPath.startsWith(lidarrRoot))
		return lidarrPath;
	return path.join(localRoot, path.relative(lidarrRoot, lidarrPath));
}

// Phase B like the catalogs: once Lidarr has the album, its files are a quick local copy.
export function createLidarrProvider(options: LidarrOptions): Provider {
	const client = createLidarrClient(options);
	return {
		id: "lidarr",
		kind: "library",
		phase: "B",

		async health(): Promise<ProviderHealth> {
			const started = Date.now();
			const status = await client.status();
			return {
				ok: true,
				latencyMs: Date.now() - started,
				detail: `lidarr ${status.version}`,
			};
		},

		async search(target) {
			if (!target.album) return [];
			const album = await client.findAlbum({
				artist: target.artists[0] ?? "",
				album: target.album,
			});
			const owned = album && (await client.libraryAlbum(album.foreignAlbumId));
			if (!owned?.id) return [];
			const tracks = await client.albumTracks(owned.id);
			return tracks.flatMap(({ track, file }): Candidate[] => {
				const confidence = trackMatch(target, track);
				const format = FORMATS[path.extname(file.path).toLowerCase()];
				if (confidence === 0 || !format) return [];
				return [
					{
						providerId: "lidarr",
						ref: file.path,
						format,
						bitrateKbps: numberOrUndefined(file.mediaInfo?.audioBitrate),
						bitDepth: numberOrUndefined(file.mediaInfo?.audioBits),
						sampleRateHz: numberOrUndefined(file.mediaInfo?.audioSampleRate),
						durationMs: track.duration,
						isrcMatch: false,
						matchConfidence: confidence,
						estimatedSeconds: 1,
					},
				];
			});
		},

		// A copy: Lidarr's library is Lidarr's (D-012), Lyterion only ever writes its own subtree.
		async fetch(candidate, stagingDir): Promise<FetchedFile> {
			const source = localPath(candidate.ref, options);
			await mkdir(stagingDir, { recursive: true });
			const dest = path.join(
				stagingDir,
				`${randomUUID()}-${path.basename(source)}`,
			);
			await copyFile(source, dest);
			return { path: dest, candidate };
		},
	};
}
