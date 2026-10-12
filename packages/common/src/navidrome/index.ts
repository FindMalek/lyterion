import { normalizeArtist, parseTitle } from "../identity/normalize";
import type { SubsonicSong } from "./client";

// library.index (#18, docs/matching.md § Dedupe): ISRC tag, then MB recording id, then artist + title + duration.
const DURATION_TOLERANCE_S = 2;

export type IndexRecording = {
	id: string;
	isrcs: string[];
	mbRecordingId: string | null;
	title: string;
	artists: string[];
	durationMs: number;
};

function fuzzyKey(artist: string, title: string): string {
	const parsed = parseTitle(title);
	return `${normalizeArtist(artist)}|${parsed.base}|${[...parsed.flags].sort().join(",")}`;
}

/** Existing songs outside Lyterion's own subtree that already are a wanted recording. */
export function matchExisting(
	recordings: IndexRecording[],
	songs: SubsonicSong[],
	librarySubdir: string,
): Map<string, SubsonicSong> {
	const foreign = songs.filter(
		(s) => s.path && !s.path.startsWith(`${librarySubdir}/`),
	);
	const byIsrc = new Map<string, SubsonicSong>();
	const byMb = new Map<string, SubsonicSong>();
	const byKey = new Map<string, SubsonicSong[]>();
	for (const song of foreign) {
		for (const isrc of song.isrc ?? []) byIsrc.set(isrc.toUpperCase(), song);
		if (song.musicBrainzId) byMb.set(song.musicBrainzId, song);
		const key = fuzzyKey(song.artist ?? "", song.title);
		byKey.set(key, [...(byKey.get(key) ?? []), song]);
	}
	const matches = new Map<string, SubsonicSong>();
	for (const rec of recordings) {
		const hit =
			rec.isrcs.map((i) => byIsrc.get(i.toUpperCase())).find(Boolean) ??
			(rec.mbRecordingId ? byMb.get(rec.mbRecordingId) : undefined) ??
			byKey
				.get(fuzzyKey(rec.artists[0] ?? "", rec.title))
				?.find(
					(s) =>
						s.duration !== undefined &&
						Math.abs(s.duration - rec.durationMs / 1000) <=
							DURATION_TOLERANCE_S,
				);
		if (hit) matches.set(rec.id, hit);
	}
	return matches;
}
