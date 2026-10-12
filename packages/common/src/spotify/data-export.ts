// Spotify "Download your data" (#12): field names unverified against a real export, so every one is optional.
export type ExportItem = {
	trackId: string | null;
	trackName: string;
	artistName: string;
	albumName: string | null;
	addedAt: string | null;
};

export type ExportPlaylist = {
	name: string;
	description: string | null;
	items: ExportItem[];
};

export type ParsedDataExport = {
	playlists: ExportPlaylist[];
	likedTrackIds: string[];
	savedAlbumIds: string[];
	followedArtistIds: string[];
};

function idFromUri(
	uri: unknown,
	kind: "track" | "album" | "artist",
): string | null {
	if (typeof uri !== "string") return null;
	const match =
		uri.match(new RegExp(`spotify:${kind}:([A-Za-z0-9]{22})`)) ??
		uri.match(new RegExp(`open\\.spotify\\.com/${kind}/([A-Za-z0-9]{22})`));
	return match?.[1] ?? null;
}

type RawPlaylistItem = {
	track?: {
		trackName?: string;
		artistName?: string;
		albumName?: string;
		trackUri?: string;
		uri?: string;
	} | null;
	localTrack?: { uri?: string } | null;
	addedDate?: string;
};
type RawPlaylist = {
	name?: string;
	description?: string | null;
	items?: RawPlaylistItem[];
};
type RawLibrary = {
	tracks?: { track?: string; artist?: string; album?: string; uri?: string }[];
	albums?: { uri?: string }[];
	artists?: { uri?: string }[];
};

/** files: name → JSON text for every Playlist*.json and YourLibrary.json found in the upload. */
export function parseDataExport(
	files: Record<string, string>,
): ParsedDataExport {
	const out: ParsedDataExport = {
		playlists: [],
		likedTrackIds: [],
		savedAlbumIds: [],
		followedArtistIds: [],
	};
	for (const [name, text] of Object.entries(files)) {
		const base = name.split("/").at(-1) ?? name;
		const json = JSON.parse(text) as { playlists?: RawPlaylist[] } & RawLibrary;
		if (/^Playlist\d*\.json$/i.test(base)) {
			for (const p of json.playlists ?? []) {
				if (!p.name) continue;
				out.playlists.push({
					name: p.name,
					description: p.description ?? null,
					items: (p.items ?? []).flatMap((item) => {
						const t = item.track;
						if (!t) return [];
						return [
							{
								trackId: idFromUri(t.trackUri ?? t.uri, "track"),
								trackName: t.trackName ?? "",
								artistName: t.artistName ?? "",
								albumName: t.albumName ?? null,
								addedAt: item.addedDate ?? null,
							},
						];
					}),
				});
			}
		} else if (/^YourLibrary\.json$/i.test(base)) {
			out.likedTrackIds.push(
				...(json.tracks ?? []).flatMap((t) => idFromUri(t.uri, "track") ?? []),
			);
			out.savedAlbumIds.push(
				...(json.albums ?? []).flatMap((a) => idFromUri(a.uri, "album") ?? []),
			);
			out.followedArtistIds.push(
				...(json.artists ?? []).flatMap(
					(a) => idFromUri(a.uri, "artist") ?? [],
				),
			);
		}
	}
	return out;
}
