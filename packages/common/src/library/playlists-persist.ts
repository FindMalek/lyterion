import { db } from "@lyterion/db";
import { libraryFile, recordingMember } from "@lyterion/db/schema/library";
import {
	librarySave,
	playlistEntry,
	spotifyPlaylist,
	spotifyTrack,
} from "@lyterion/db/schema/spotify";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { PlaylistSpec } from "./playlist";

export const LIKED_SONGS = "Liked Songs";

type Track = { durationMs: number; artist: string; title: string };

// One spec per Spotify playlist plus Liked Songs; entries resolve to whichever file holds their recording.
export async function playlistSpecs(): Promise<
	(PlaylistSpec & { imageUrl: string | null })[]
> {
	const [playlists, entries, liked, files, members, tracks] = await Promise.all(
		[
			db.select().from(spotifyPlaylist),
			db
				.select()
				.from(playlistEntry)
				.orderBy(asc(playlistEntry.playlistId), asc(playlistEntry.position)),
			db
				.select({ id: librarySave.spotifyId })
				.from(librarySave)
				.where(
					and(
						eq(librarySave.kind, "liked_track"),
						isNull(librarySave.removedAt),
					),
				)
				.orderBy(desc(librarySave.addedAt)),
			db
				.select({
					recordingId: libraryFile.recordingId,
					path: libraryFile.path,
				})
				.from(libraryFile),
			db.select().from(recordingMember),
			db
				.select({
					id: spotifyTrack.id,
					durationMs: spotifyTrack.durationMs,
					artists: spotifyTrack.artists,
					title: spotifyTrack.title,
				})
				.from(spotifyTrack),
		],
	);
	const pathOfRecording = new Map<string, string>();
	for (const f of files)
		if (f.recordingId && !pathOfRecording.has(f.recordingId))
			pathOfRecording.set(f.recordingId, f.path);
	const recordingOf = new Map(
		members.map((m) => [m.spotifyTrackId, m.recordingId]),
	);
	const trackOf = new Map<string, Track>(
		tracks.map((t) => [
			t.id,
			{
				durationMs: t.durationMs,
				artist: t.artists.join(", "),
				title: t.title,
			},
		]),
	);
	const entryFor = (trackId: string | null, fallback?: Track) => {
		const track = (trackId ? trackOf.get(trackId) : undefined) ??
			fallback ?? { durationMs: 0, artist: "", title: "" };
		const recordingId = trackId ? recordingOf.get(trackId) : undefined;
		return {
			...track,
			path: recordingId ? (pathOfRecording.get(recordingId) ?? null) : null,
		};
	};

	const specs = playlists.map((p) => ({
		name: p.name,
		description: p.description,
		coverPath: null,
		imageUrl: p.imageUrl,
		entries: entries
			.filter((e) => e.playlistId === p.id)
			.map((e) =>
				entryFor(e.spotifyTrackId, {
					durationMs: e.localDurationMs ?? 0,
					artist: e.localArtist ?? "",
					title: e.localName ?? "",
				}),
			),
	}));
	if (liked.length > 0)
		specs.push({
			name: LIKED_SONGS,
			description: "Spotify liked songs, newest first",
			coverPath: null,
			imageUrl: null,
			entries: liked.map((l) => entryFor(l.id)),
		});
	return specs;
}
