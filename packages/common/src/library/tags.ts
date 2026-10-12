// Tag set from docs/library.md § Tags, Picard naming: MUSICBRAINZ_TRACKID holds the recording MBID.
export type TrackMetadata = {
	title: string;
	artists: string[];
	album: string;
	albumArtists: string[];
	trackNumber: number;
	trackTotal: number;
	discNumber: number;
	discTotal: number;
	date: string | null;
	originalDate: string | null;
	releaseType: string | null;
	compilation: boolean;
	isrc: string | null;
	barcode: string | null;
	genres: string[];
	mbRecordingId: string | null;
	mbReleaseTrackId: string | null;
	mbReleaseId: string | null;
	mbReleaseGroupId: string | null;
	mbArtistIds: string[];
	mbAlbumArtistIds: string[];
	lyterionRecordingId: string;
	spotifyTrackId: string | null;
};

export type TagMap = Record<string, string[]>;

export function buildTags(meta: TrackMetadata): TagMap {
	const entries: [string, (string | null | undefined)[]][] = [
		["TITLE", [meta.title]],
		["ARTIST", [meta.artists.join(", ")]],
		["ARTISTS", meta.artists],
		["ALBUM", [meta.album]],
		["ALBUMARTIST", [meta.albumArtists.join(", ")]],
		["ALBUMARTISTS", meta.albumArtists],
		["TRACKNUMBER", [String(meta.trackNumber)]],
		["TRACKTOTAL", [String(meta.trackTotal)]],
		["DISCNUMBER", [String(meta.discNumber)]],
		["DISCTOTAL", [String(meta.discTotal)]],
		["DATE", [meta.date]],
		["ORIGINALDATE", [meta.originalDate]],
		["RELEASETYPE", [meta.releaseType?.toLowerCase()]],
		["COMPILATION", [meta.compilation ? "1" : null]],
		["ISRC", [meta.isrc]],
		["BARCODE", [meta.barcode]],
		["GENRE", meta.genres.slice(0, 3)],
		["MUSICBRAINZ_TRACKID", [meta.mbRecordingId]],
		["MUSICBRAINZ_RELEASETRACKID", [meta.mbReleaseTrackId]],
		["MUSICBRAINZ_ALBUMID", [meta.mbReleaseId]],
		["MUSICBRAINZ_RELEASEGROUPID", [meta.mbReleaseGroupId]],
		["MUSICBRAINZ_ARTISTID", meta.mbArtistIds],
		["MUSICBRAINZ_ALBUMARTISTID", meta.mbAlbumArtistIds],
		["LYTERION_RECORDING_ID", [meta.lyterionRecordingId]],
		["SPOTIFY_TRACKID", [meta.spotifyTrackId]],
	];
	const tags: TagMap = {};
	for (const [key, values] of entries) {
		const kept = values.filter(
			(v): v is string => typeof v === "string" && v.length > 0,
		);
		if (kept.length > 0) tags[key] = kept;
	}
	return tags;
}
