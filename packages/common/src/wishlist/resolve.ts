import { normalizeText } from "../identity/normalize";
import {
	createYoutubeLookup,
	isMediaLink,
	parseUpload,
	type YoutubeMeta,
	type YoutubeOptions,
} from "../providers/youtube";

export type WishMeta = YoutubeMeta;

const DEEZER_TRACK =
	/^https?:\/\/(?:www\.)?deezer\.com\/(?:\w+\/)?track\/(\d+)/i;
const DEEZER_SHORT = /^https?:\/\/(?:link\.deezer\.com|dzr\.page\.link)\//i;

type DeezerTrack = {
	title: string;
	duration: number;
	isrc?: string;
	artist: { name: string };
	album?: { cover_medium?: string };
	error?: unknown;
};

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
	return {
		title: track.title,
		artists: [track.artist.name],
		durationMs: track.duration * 1000,
		isrc: track.isrc,
		coverUrl: track.album?.cover_medium,
		source: "deezer",
	};
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
	return {
		title: best.track.title,
		artists: [best.track.artist.name],
		durationMs: best.track.duration * 1000,
		isrc: best.track.isrc,
		coverUrl: best.track.album?.cover_medium,
		source: "deezer",
	};
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
