import {
	createYoutubeLookup,
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
