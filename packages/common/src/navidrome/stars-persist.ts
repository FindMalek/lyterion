import { db } from "@lyterion/db";
import { libraryFile, recordingMember } from "@lyterion/db/schema/library";
import { librarySave, spotifyArtist } from "@lyterion/db/schema/spotify";
import { isNotNull } from "drizzle-orm";

import { normalizeArtist } from "../identity/normalize";
import { releaseId } from "../identity/resolve";
import type { NavidromeClient } from "./client";
import type { StarIds } from "./stars";

function empty(): StarIds {
	return { songs: new Set(), albums: new Set(), artists: new Set() };
}

// Spotify ids → Navidrome ids through what Lyterion placed and linked; unlinked items wait for the next scan.
export async function spotifyStarTargets(client: NavidromeClient) {
	const [saves, files, members, artists, songs, ndArtists] = await Promise.all([
		db.select().from(librarySave),
		db
			.select({
				recordingId: libraryFile.recordingId,
				releaseId: libraryFile.releaseId,
				songId: libraryFile.navidromeSongId,
			})
			.from(libraryFile)
			.where(isNotNull(libraryFile.navidromeSongId)),
		db.select().from(recordingMember),
		db
			.select({ id: spotifyArtist.id, name: spotifyArtist.name })
			.from(spotifyArtist),
		client.allSongs(),
		client.artists(),
	]);
	const songOfRecording = new Map<string, string>();
	const songsOfRelease = new Map<string, string[]>();
	for (const f of files) {
		if (!f.songId) continue;
		if (f.recordingId && !songOfRecording.has(f.recordingId))
			songOfRecording.set(f.recordingId, f.songId);
		if (f.releaseId)
			songsOfRelease.set(f.releaseId, [
				...(songsOfRelease.get(f.releaseId) ?? []),
				f.songId,
			]);
	}
	const recordingOfTrack = new Map(
		members.map((m) => [m.spotifyTrackId, m.recordingId]),
	);
	const albumOfSong = new Map(
		songs.flatMap((s) => (s.albumId ? [[s.id, s.albumId] as const] : [])),
	);
	const artistByName = new Map(
		ndArtists.map((a) => [normalizeArtist(a.name), a.id]),
	);
	const artistName = new Map(artists.map((a) => [a.id, a.name]));

	const wanted = empty();
	const removed = empty();
	for (const save of saves) {
		const into = save.removedAt ? removed : wanted;
		if (save.kind === "liked_track") {
			const recordingId = recordingOfTrack.get(save.spotifyId);
			const songId = recordingId ? songOfRecording.get(recordingId) : undefined;
			if (songId) into.songs.add(songId);
		} else if (save.kind === "saved_album") {
			for (const songId of songsOfRelease.get(releaseId(save.spotifyId)) ??
				[]) {
				const albumId = albumOfSong.get(songId);
				if (albumId) into.albums.add(albumId);
			}
		} else {
			const name = artistName.get(save.spotifyId);
			const artistId = name
				? artistByName.get(normalizeArtist(name))
				: undefined;
			if (artistId) into.artists.add(artistId);
		}
	}
	return { wanted, removed };
}
