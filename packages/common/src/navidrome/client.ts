import { subsonicAuthParams } from "../health/connections";

// Subsonic API v1.16.1 against Navidrome, called as the owner (D-024).
const TIMEOUT_MS = 30_000;
const PAGE = 500;

export type SubsonicSong = {
	id: string;
	path?: string;
	title: string;
	artist?: string;
	album?: string;
	albumId?: string;
	artistId?: string;
	duration?: number;
	starred?: string;
	suffix?: string;
	bitRate?: number;
	samplingRate?: number;
	bitDepth?: number;
	isrc?: string[];
	musicBrainzId?: string;
};

export type ScanStatus = { scanning: boolean; count?: number };

export type NavidromeCredentials = {
	url: string;
	user: string;
	password: string;
};

export class SubsonicError extends Error {}

export function createNavidromeClient(
	creds: NavidromeCredentials,
	doFetch: typeof fetch = fetch,
) {
	const base = creds.url.replace(/\/$/, "");

	async function call<T>(
		method: string,
		params: Record<string, string | string[]> = {},
	): Promise<T> {
		const query = subsonicAuthParams(creds.user, creds.password);
		for (const [key, value] of Object.entries(params))
			for (const v of Array.isArray(value) ? value : [value])
				query.append(key, v);
		const res = await doFetch(`${base}/rest/${method}.view?${query}`, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok) throw new SubsonicError(`${method}: HTTP ${res.status}`);
		const body = (await res.json()) as {
			"subsonic-response"?: {
				status?: string;
				error?: { message?: string };
			} & Record<string, unknown>;
		};
		const reply = body["subsonic-response"];
		if (reply?.status !== "ok")
			throw new SubsonicError(
				`${method}: ${reply?.error?.message ?? "failed"}`,
			);
		return reply as T;
	}

	return {
		call,
		async startScan(fullScan = false): Promise<ScanStatus> {
			const reply = await call<{ scanStatus?: ScanStatus }>(
				"startScan",
				fullScan ? { fullScan: "true" } : {},
			);
			return reply.scanStatus ?? { scanning: true };
		},
		async getScanStatus(): Promise<ScanStatus> {
			const reply = await call<{ scanStatus?: ScanStatus }>("getScanStatus");
			return reply.scanStatus ?? { scanning: false };
		},
		/** Every song with its path; Navidrome treats an empty search3 query as "all". */
		async allSongs(): Promise<SubsonicSong[]> {
			const songs: SubsonicSong[] = [];
			for (let offset = 0; ; offset += PAGE) {
				const reply = await call<{ searchResult3?: { song?: SubsonicSong[] } }>(
					"search3",
					{
						query: "",
						songCount: String(PAGE),
						songOffset: String(offset),
						artistCount: "0",
						albumCount: "0",
					},
				);
				const page = reply.searchResult3?.song ?? [];
				songs.push(...page);
				if (page.length < PAGE) return songs;
			}
		},
		async starred(): Promise<{
			songs: string[];
			albums: string[];
			artists: string[];
		}> {
			const reply = await call<{
				starred2?: {
					song?: { id: string }[];
					album?: { id: string }[];
					artist?: { id: string }[];
				};
			}>("getStarred2");
			const s = reply.starred2 ?? {};
			return {
				songs: (s.song ?? []).map((x) => x.id),
				albums: (s.album ?? []).map((x) => x.id),
				artists: (s.artist ?? []).map((x) => x.id),
			};
		},
		async artists(): Promise<{ id: string; name: string }[]> {
			const reply = await call<{
				artists?: { index?: { artist?: { id: string; name: string }[] }[] };
			}>("getArtists");
			return (reply.artists?.index ?? []).flatMap((i) => i.artist ?? []);
		},
		async playlists(): Promise<{ id: string; name: string }[]> {
			const reply = await call<{
				playlists?: { playlist?: { id: string; name: string }[] };
			}>("getPlaylists");
			return reply.playlists?.playlist ?? [];
		},
		async playlistSongs(id: string): Promise<string[]> {
			const reply = await call<{ playlist?: { entry?: { id: string }[] } }>(
				"getPlaylist",
				{ id },
			);
			return (reply.playlist?.entry ?? []).map((e) => e.id);
		},
		async createPlaylist(name: string): Promise<string | null> {
			const reply = await call<{ playlist?: { id: string } }>(
				"createPlaylist",
				{ name },
			);
			return reply.playlist?.id ?? null;
		},
		async removeFromPlaylist(playlistId: string, indexes: number[]) {
			await call("updatePlaylist", {
				playlistId,
				songIndexToRemove: indexes.map(String),
			});
		},
		async setRating(id: string, rating: number) {
			await call("setRating", { id, rating: String(rating) });
		},
		async star(ids: {
			id?: string[];
			albumId?: string[];
			artistId?: string[];
		}) {
			await call("star", ids as Record<string, string[]>);
		},
		async unstar(ids: {
			id?: string[];
			albumId?: string[];
			artistId?: string[];
		}) {
			await call("unstar", ids as Record<string, string[]>);
		},
	};
}

export type NavidromeClient = ReturnType<typeof createNavidromeClient>;
