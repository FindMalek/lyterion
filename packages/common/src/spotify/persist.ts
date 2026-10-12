import { conflictValue, db } from "@lyterion/db";
import {
	exportPage,
	librarySave,
	playlistEntry,
	spotifyAlbum,
	spotifyArtist,
	spotifyPlaylist,
	spotifyTrack,
} from "@lyterion/db/schema/spotify";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";

import { chunk } from "../trigger/utils/chunk";
import type { LibraryExport } from "./export";

const BATCH = 500;

export async function saveExportPage(
	runId: number,
	endpoint: string,
	body: unknown[],
): Promise<void> {
	await db.insert(exportPage).values({ runId, endpoint, body });
}

export async function persistExport(out: LibraryExport): Promise<void> {
	const now = new Date();
	for (const rows of chunk([...out.artists.values()], BATCH)) {
		await db
			.insert(spotifyArtist)
			.values(rows.map((r) => ({ ...r, updatedAt: now })))
			.onConflictDoUpdate({
				target: spotifyArtist.id,
				set: {
					name: conflictValue(spotifyArtist.name),
					genres: sql`case when cardinality(excluded.genres) > 0 then excluded.genres else ${spotifyArtist.genres} end`,
					updatedAt: now,
				},
			});
	}
	for (const rows of chunk([...out.albums.values()], BATCH)) {
		await db
			.insert(spotifyAlbum)
			.values(rows.map((r) => ({ ...r, updatedAt: now })))
			.onConflictDoUpdate({
				target: spotifyAlbum.id,
				set: {
					title: conflictValue(spotifyAlbum.title),
					artists: conflictValue(spotifyAlbum.artists),
					artistIds: conflictValue(spotifyAlbum.artistIds),
					releaseDate: conflictValue(spotifyAlbum.releaseDate),
					releaseDatePrecision: conflictValue(
						spotifyAlbum.releaseDatePrecision,
					),
					albumType: conflictValue(spotifyAlbum.albumType),
					totalTracks: conflictValue(spotifyAlbum.totalTracks),
					upc: sql`coalesce(excluded.upc, ${spotifyAlbum.upc})`,
					imageUrl: sql`coalesce(excluded.image_url, ${spotifyAlbum.imageUrl})`,
					updatedAt: now,
				},
			});
	}
	for (const rows of chunk([...out.tracks.values()], BATCH)) {
		await db
			.insert(spotifyTrack)
			.values(rows.map((r) => ({ ...r, updatedAt: now })))
			.onConflictDoUpdate({
				target: spotifyTrack.id,
				set: {
					title: conflictValue(spotifyTrack.title),
					artists: conflictValue(spotifyTrack.artists),
					artistIds: conflictValue(spotifyTrack.artistIds),
					durationMs: conflictValue(spotifyTrack.durationMs),
					explicit: conflictValue(spotifyTrack.explicit),
					linkedFromId: conflictValue(spotifyTrack.linkedFromId),
					isrc: sql`coalesce(excluded.isrc, ${spotifyTrack.isrc})`,
					albumId: sql`coalesce(excluded.album_id, ${spotifyTrack.albumId})`,
					discNumber: sql`coalesce(excluded.disc_number, ${spotifyTrack.discNumber})`,
					trackNumber: sql`coalesce(excluded.track_number, ${spotifyTrack.trackNumber})`,
					popularity: sql`coalesce(excluded.popularity, ${spotifyTrack.popularity})`,
					updatedAt: now,
				},
			});
	}
	for (const playlist of out.playlists) {
		await db
			.insert(spotifyPlaylist)
			.values({ ...playlist, updatedAt: now })
			.onConflictDoUpdate({
				target: spotifyPlaylist.id,
				set: {
					name: conflictValue(spotifyPlaylist.name),
					description: conflictValue(spotifyPlaylist.description),
					ownerId: conflictValue(spotifyPlaylist.ownerId),
					snapshotId: conflictValue(spotifyPlaylist.snapshotId),
					imageUrl: conflictValue(spotifyPlaylist.imageUrl),
					isCollaborative: conflictValue(spotifyPlaylist.isCollaborative),
					itemsUnavailable: conflictValue(spotifyPlaylist.itemsUnavailable),
					updatedAt: now,
				},
			});
		if (playlist.itemsUnavailable) continue;
		const entries = out.entries.filter((e) => e.playlistId === playlist.id);
		await db.transaction(async (tx) => {
			await tx
				.delete(playlistEntry)
				.where(eq(playlistEntry.playlistId, playlist.id));
			for (const rows of chunk(entries, BATCH))
				await tx.insert(playlistEntry).values(rows);
		});
	}
	for (const kind of [
		"liked_track",
		"saved_album",
		"followed_artist",
	] as const) {
		const saves = out.saves.filter((s) => s.kind === kind);
		for (const rows of chunk(saves, BATCH)) {
			await db
				.insert(librarySave)
				.values(rows.map((r) => ({ ...r, removedAt: null })))
				.onConflictDoUpdate({
					target: [librarySave.kind, librarySave.spotifyId],
					set: {
						addedAt: sql`coalesce(excluded.added_at, ${librarySave.addedAt})`,
						removedAt: null,
					},
				});
		}
		const ids = saves.map((s) => s.spotifyId);
		await db
			.update(librarySave)
			.set({ removedAt: now })
			.where(
				and(
					eq(librarySave.kind, kind),
					isNull(librarySave.removedAt),
					ids.length > 0 ? notInArray(librarySave.spotifyId, ids) : undefined,
				),
			);
	}
}
