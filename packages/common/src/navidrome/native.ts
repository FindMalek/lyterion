import type { NavidromeCredentials } from "./client";

const TIMEOUT_MS = 30_000;

export type NativePlaylist = {
	id: string;
	name: string;
	ownerName?: string;
	path?: string;
	sync?: boolean;
	songCount: number;
} & Record<string, unknown>;

/**
 * Navidrome's own API (not Subsonic), for what Subsonic can't do: turning off a playlist's file sync. Navidrome keeps
 * playlists imported from .m3u files read-only while they sync; with sync off they're normal, editable playlists.
 */
export function createNativeClient(
	creds: NavidromeCredentials,
	doFetch: typeof fetch = fetch,
) {
	const base = creds.url.replace(/\/$/, "");
	let token: string | null = null;

	async function login(): Promise<string> {
		const res = await doFetch(`${base}/auth/login`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ username: creds.user, password: creds.password }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok) throw new Error(`navidrome login: HTTP ${res.status}`);
		token = ((await res.json()) as { token: string }).token;
		return token;
	}

	async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
		const res = await doFetch(`${base}${path}`, {
			...init,
			headers: {
				"content-type": "application/json",
				"x-nd-authorization": `Bearer ${token ?? (await login())}`,
			},
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok) throw new Error(`navidrome ${path}: HTTP ${res.status}`);
		return (await res.json()) as T;
	}

	return {
		playlists: () => call<NativePlaylist[]>("/api/playlist?_end=10000"),
		/** Stop syncing a playlist from its file: it keeps its songs and id, and becomes editable everywhere. */
		async stopSync(id: string): Promise<void> {
			const playlist = await call<NativePlaylist>(`/api/playlist/${id}`);
			await call(`/api/playlist/${id}`, {
				method: "PUT",
				body: JSON.stringify({ ...playlist, sync: false }),
			});
		},
	};
}
