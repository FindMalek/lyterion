const API = "https://api.spotify.com/v1";
const MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_AFTER_S = 5;

export class SpotifyHttpError extends Error {
	constructor(
		readonly status: number,
		readonly url: string,
	) {
		super(`spotify ${status} ${url}`);
	}
}

export type GetToken = (forceRefresh: boolean) => Promise<string>;

export function createSpotifyClient(
	getToken: GetToken,
	doFetch: typeof fetch = fetch,
) {
	// 429 pauses every request, not just the one that hit it (docs/spotify.md § Edge cases).
	let pausedUntil = 0;

	async function get<T>(pathOrUrl: string): Promise<T> {
		const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`;
		let refreshed = false;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const wait = pausedUntil - Date.now();
			if (wait > 0) await new Promise((r) => setTimeout(r, wait));
			const res = await doFetch(url, {
				headers: { authorization: `Bearer ${await getToken(refreshed)}` },
			});
			if (res.status === 429) {
				const header = res.headers.get("retry-after");
				const seconds =
					header !== null && Number.isFinite(Number(header))
						? Number(header)
						: DEFAULT_RETRY_AFTER_S;
				pausedUntil = Date.now() + seconds * 1000;
				continue;
			}
			if (res.status === 401 && !refreshed) {
				refreshed = true;
				continue;
			}
			if (!res.ok) throw new SpotifyHttpError(res.status, url);
			return (await res.json()) as T;
		}
		throw new SpotifyHttpError(429, url);
	}

	async function* paginate<T>(
		pathOrUrl: string,
		pick: (page: unknown) => { items: T[]; next: string | null },
	) {
		let next: string | null = pathOrUrl;
		while (next) {
			const page = pick(await get<unknown>(next));
			yield page.items;
			next = page.next;
		}
	}

	return { get, paginate };
}

export type SpotifyClient = ReturnType<typeof createSpotifyClient>;
