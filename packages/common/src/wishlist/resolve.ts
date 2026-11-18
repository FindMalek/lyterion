import { normalizeText } from "../identity/normalize";
import {
	createYoutubeLookup,
	isMediaLink,
	makeRunner,
	parseUpload,
	type RunYtDlp,
	type YoutubeMeta,
	type YoutubeOptions,
	type YtEntry,
} from "../providers/youtube";

export type WishMeta = YoutubeMeta;

const DEEZER_TRACK =
	/^https?:\/\/(?:www\.)?deezer\.com\/(?:\w+\/)?track\/(\d+)/i;
const DEEZER_SHORT = /^https?:\/\/(?:link\.deezer\.com|dzr\.page\.link)\//i;

type DeezerTrack = {
	id?: number;
	title: string;
	duration: number;
	isrc?: string;
	artist: { name: string };
	album?: { cover_medium?: string };
	error?: unknown;
};

function trackMeta(track: DeezerTrack): WishMeta {
	return {
		title: track.title,
		artists: [track.artist.name],
		durationMs: track.duration * 1000,
		isrc: track.isrc,
		coverUrl: track.album?.cover_medium,
		source: "deezer",
	};
}

/** Deezer audio is DRM-protected, so a Deezer link is only read for what the song is, then found like a typed name. */
export async function deezerMeta(
	url: string,
	doFetch: typeof fetch = fetch,
): Promise<WishMeta | null> {
	let target = url.trim();
	if (DEEZER_SHORT.test(target)) {
		const res = await doFetch(target, { redirect: "follow" });
		target = res.url;
	}
	const id = target.match(DEEZER_TRACK)?.[1];
	if (!id) return null;
	const res = await doFetch(`https://api.deezer.com/track/${id}`);
	const track = (await res.json()) as DeezerTrack;
	if (!res.ok || track.error || !track.duration)
		throw new Error("deezer doesn't know that track");
	return trackMeta(track);
}

export type ResolveDeps = {
	youtube?: (input: string) => Promise<WishMeta>;
	deezer?: (url: string) => Promise<WishMeta | null>;
	youtubeOptions?: YoutubeOptions;
};

/** A YouTube or SoundCloud link, a Deezer track link or a plain name, as what to look for. */
export async function resolveWish(
	input: string,
	deps: ResolveDeps = {},
): Promise<WishMeta> {
	const text = input.trim();
	if (/deezer\.com|dzr\.page\.link/i.test(text)) {
		const meta = await (deps.deezer ?? deezerMeta)(text);
		if (meta) return meta;
		throw new Error("paste a deezer track link, not an album or playlist");
	}
	return (deps.youtube ?? createYoutubeLookup(deps.youtubeOptions))(text);
}

type Json = Record<string, unknown>;

async function getJson(
	url: string,
	doFetch: typeof fetch,
): Promise<Json | null> {
	try {
		const res = await doFetch(url, { signal: AbortSignal.timeout(6_000) });
		return res.ok ? ((await res.json()) as Json) : null;
	} catch {
		return null;
	}
}

const SEARCH_MIN_SCORE = 0.8;

/** The best Deezer hit when it covers nearly every word typed, so a typo or an unreleased track falls through to YouTube. */
export async function deezerSearch(
	query: string,
	doFetch: typeof fetch = fetch,
): Promise<WishMeta | null> {
	const data = await getJson(
		`https://api.deezer.com/search/track?limit=5&q=${encodeURIComponent(query)}`,
		doFetch,
	);
	const wanted = normalizeText(query).split(" ").filter(Boolean);
	if (wanted.length === 0) return null;
	let best: { track: DeezerTrack; score: number } | null = null;
	for (const track of (data?.data as DeezerTrack[] | undefined) ?? []) {
		const found = new Set(
			normalizeText(`${track.artist.name} ${track.title}`).split(" "),
		);
		const score = wanted.filter((t) => found.has(t)).length / wanted.length;
		if (!best || score > best.score) best = { track, score };
	}
	if (!best || best.score < SEARCH_MIN_SCORE) return null;
	return trackMeta(best.track);
}

/** A YouTube or SoundCloud link read through the site's oEmbed: no yt-dlp, so no length yet (the add task reads it). */
export async function oembedMeta(
	url: string,
	doFetch: typeof fetch = fetch,
): Promise<WishMeta | null> {
	const soundcloud = /soundcloud|snd\.sc/i.test(url);
	const endpoint = soundcloud
		? "https://soundcloud.com/oembed"
		: "https://www.youtube.com/oembed";
	const data = await getJson(
		`${endpoint}?format=json&url=${encodeURIComponent(url)}`,
		doFetch,
	);
	if (typeof data?.title !== "string") return null;
	const thumbnail =
		typeof data.thumbnail_url === "string" ? data.thumbnail_url : undefined;
	const author =
		typeof data.author_name === "string"
			? data.author_name.replace(/\s+-\s+Topic$/, "")
			: undefined;
	const byLine = soundcloud ? data.title.match(/^(.+) by (.+)$/) : null;
	const upload = parseUpload(byLine?.[1] ?? data.title);
	const artist = byLine?.[2] ?? upload.artist ?? author;
	return {
		title: upload.title,
		artists: artist ? [artist] : [],
		durationMs: 0,
		coverUrl: thumbnail,
		linkUrl: url,
		source: soundcloud ? "soundcloud" : "youtube",
	};
}

/**
 * What a link or a name is, fast and without yt-dlp (the preview, and the add's first look). Anything not found
 * comes back as a bare title with no length: the add task finds it on YouTube.
 */
export async function quickWish(
	input: string,
	doFetch: typeof fetch = fetch,
): Promise<WishMeta> {
	const text = input.trim();
	if (/deezer\.com|dzr\.page\.link/i.test(text)) return resolveWish(text);
	if (isMediaLink(text)) {
		return (
			(await oembedMeta(text, doFetch)) ?? {
				title: text,
				artists: [],
				durationMs: 0,
				linkUrl: text,
				source: /soundcloud|snd\.sc/i.test(text) ? "soundcloud" : "youtube",
			}
		);
	}
	return (
		(await deezerSearch(text, doFetch)) ?? {
			title: text,
			artists: [],
			durationMs: 0,
			source: "search",
		}
	);
}

export type WishCandidate = WishMeta & { input: string };

/** Up to eight Deezer hits for a typed name to pick from; `input` is the track link the add then takes. */
export async function deezerCandidates(
	query: string,
	doFetch: typeof fetch = fetch,
): Promise<WishCandidate[]> {
	const res = await doFetch(
		`https://api.deezer.com/search/track?limit=8&q=${encodeURIComponent(query)}`,
		{ signal: AbortSignal.timeout(6_000) },
	);
	if (!res.ok) throw new Error(`deezer answered ${res.status}`);
	const data = (await res.json()) as { data?: DeezerTrack[]; error?: unknown };
	if (data.error) throw new Error("deezer search failed");
	return (data.data ?? [])
		.filter((track) => track.id && track.duration && track.artist?.name)
		.map((track) => ({
			...trackMeta(track),
			input: `https://www.deezer.com/track/${track.id}`,
		}));
}

const MEDIA_SEARCH_TIMEOUT_MS = 12_000;
const MEDIA_SEARCH_CONCURRENCY = 4;
const MIN_COVER_PX = 120;

let searching = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
	if (searching >= MEDIA_SEARCH_CONCURRENCY)
		await new Promise<void>((resolve) => waiting.push(resolve));
	searching++;
	try {
		return await task();
	} finally {
		searching--;
		waiting.shift()?.();
	}
}

/** The smallest thumbnail that is still sharp, so the player can inline it. */
function smallThumbnail(entry: YtEntry): string | undefined {
	const sized = (entry.thumbnails ?? [])
		.filter((t) => (t.width ?? 0) >= MIN_COVER_PX)
		.sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
	return sized[0]?.url ?? entry.thumbnails?.at(-1)?.url;
}

/** One site's top hits through yt-dlp's flat search (no per-video fetch): quick; a slow or failing site throws. */
async function mediaSearch(
	site: "youtube" | "soundcloud",
	query: string,
	run: RunYtDlp,
	limit: number,
): Promise<WishCandidate[]> {
	const prefix = site === "youtube" ? "ytsearch" : "scsearch";
	const stdout = await withSlot(() =>
		run(["--flat-playlist", "--dump-json", `${prefix}${limit}:${query}`]),
	);
	return stdout
		.split("\n")
		.filter((line) => line.trim().startsWith("{"))
		.map((line) => JSON.parse(line) as YtEntry)
		.flatMap((entry): WishCandidate[] => {
			const link =
				entry.webpage_url ??
				entry.url ??
				(site === "youtube"
					? `https://www.youtube.com/watch?v=${entry.id}`
					: undefined);
			if (!link || !entry.duration || !/^https?:/i.test(link)) return [];
			const upload = parseUpload(entry.title);
			const artist =
				upload.artist ??
				(entry.channel ?? entry.uploader ?? "").replace(/\s+-\s+Topic$/, "");
			return [
				{
					title: upload.title,
					artists: artist ? [artist] : [],
					durationMs: Math.round(entry.duration * 1000),
					coverUrl:
						smallThumbnail(entry) ??
						(site === "youtube"
							? `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`
							: undefined),
					linkUrl: link,
					source: site,
					input: link,
				},
			];
		});
}

export type SearchDeps = {
	deezer?: (query: string) => Promise<WishCandidate[]>;
	run?: RunYtDlp;
	youtubeOptions?: YoutubeOptions;
};

/** Deezer first, then SoundCloud and YouTube; a source that fails or times out is named in `unreachable`. */
export async function searchCandidates(
	query: string,
	deps: SearchDeps = {},
): Promise<{ candidates: WishCandidate[]; unreachable: string[] }> {
	const run =
		deps.run ??
		makeRunner({
			...deps.youtubeOptions,
			timeoutMs: MEDIA_SEARCH_TIMEOUT_MS,
		});
	const sources = {
		deezer: (deps.deezer ?? deezerCandidates)(query),
		soundcloud: mediaSearch("soundcloud", query, run, 3),
		youtube: mediaSearch("youtube", query, run, 3),
	};
	const names = Object.keys(sources) as (keyof typeof sources)[];
	const settled = await Promise.allSettled(Object.values(sources));
	const found = (name: keyof typeof sources): WishCandidate[] => {
		const result = settled[names.indexOf(name)];
		return result?.status === "fulfilled" ? result.value : [];
	};
	return {
		candidates: [
			...found("deezer").slice(0, 4),
			...found("youtube").slice(0, 2),
			...found("soundcloud").slice(0, 2),
		],
		unreachable: names.filter((_, i) => settled[i]?.status === "rejected"),
	};
}
