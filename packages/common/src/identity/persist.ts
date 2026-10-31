import { db } from "@lyterion/db";
import {
	libraryFile,
	recording,
	recordingMember,
	recordingOverride,
	release,
	releaseTrack,
} from "@lyterion/db/schema/library";
import {
	librarySave,
	spotifyAlbum,
	spotifyTrack,
} from "@lyterion/db/schema/spotify";
import {
	and,
	eq,
	inArray,
	isNotNull,
	isNull,
	notInArray,
	sql,
} from "drizzle-orm";

import { chunk } from "../trigger/utils/chunk";
import {
	type ResolvedRecording,
	type ResolvedRelease,
	resolveIdentity,
} from "./resolve";

const BATCH = 500;

export async function loadResolveInput() {
	const [tracks, albums, saved, members, previous, overrides, files] =
		await Promise.all([
			db.select().from(spotifyTrack).where(eq(spotifyTrack.isLocal, false)),
			db.select().from(spotifyAlbum),
			db
				.select({ id: librarySave.spotifyId })
				.from(librarySave)
				.where(
					and(
						eq(librarySave.kind, "saved_album"),
						isNull(librarySave.removedAt),
					),
				),
			db.select().from(recordingMember),
			db
				.select({ id: recording.id, placed: recording.placedReleaseIds })
				.from(recording),
			db.select().from(recordingOverride),
			db
				.select({
					recordingId: libraryFile.recordingId,
					acoustid: libraryFile.acoustidRecording,
				})
				.from(libraryFile)
				.where(
					and(
						eq(libraryFile.owned, true),
						isNotNull(libraryFile.recordingId),
						isNotNull(libraryFile.acoustidRecording),
					),
				),
		]);
	const acoustidOfRecording = new Map(
		files.map((f) => [f.recordingId, f.acoustid]),
	);
	const recordingOfTrack = new Map(
		members.map((m) => [m.spotifyTrackId, m.recordingId]),
	);
	return {
		tracks: tracks.map((t) => ({
			id: t.id,
			isrc: t.isrc,
			title: t.title,
			artists: t.artists,
			durationMs: t.durationMs,
			explicit: t.explicit,
			popularity: t.popularity ?? undefined,
			albumId: t.albumId,
			discNumber: t.discNumber,
			trackNumber: t.trackNumber,
			acoustidRecording:
				acoustidOfRecording.get(recordingOfTrack.get(t.id) ?? "") ?? null,
		})),
		albums: albums.map((a) => ({
			id: a.id,
			title: a.title,
			artists: a.artists,
			albumType: a.albumType,
			totalTracks: a.totalTracks,
			releaseDate: a.releaseDate,
			imageUrl: a.imageUrl,
		})),
		savedAlbumIds: new Set(saved.map((s) => s.id)),
		existingMembers: new Map(
			members.map((m) => [m.spotifyTrackId, m.recordingId]),
		),
		overrides: overrides.map((o) => ({
			kind: o.kind,
			trackIds: [o.trackA, o.trackB] as [string, string],
		})),
		previousPlacements: new Map(
			previous.filter((p) => p.placed.length > 0).map((p) => [p.id, p.placed]),
		),
	};
}

// Upserts only; a recording that already got further than "resolved" keeps its status.
export async function persistIdentity(
	recordings: ResolvedRecording[],
	releases: ResolvedRelease[],
): Promise<void> {
	await db.transaction(async (tx) => {
		for (const batch of chunk(recordings, BATCH)) {
			await tx
				.insert(recording)
				.values(
					batch.map((r) => ({
						id: r.id,
						title: r.title,
						artists: r.artists,
						versionFlags: r.versionFlags,
						durationMs: r.durationMs,
						isrcs: r.isrcs,
						preferredSpotifyTrackId: r.preferredSpotifyTrackId,
						placedReleaseIds: r.placedReleaseIds,
						status: "resolved" as const,
					})),
				)
				.onConflictDoUpdate({
					target: recording.id,
					set: {
						title: sql`excluded.title`,
						artists: sql`excluded.artists`,
						versionFlags: sql`excluded.version_flags`,
						durationMs: sql`excluded.duration_ms`,
						isrcs: sql`excluded.isrcs`,
						preferredSpotifyTrackId: sql`excluded.preferred_spotify_track_id`,
						placedReleaseIds: sql`excluded.placed_release_ids`,
						status: sql`case when ${recording.status} = 'pending' then 'resolved' else ${recording.status} end`,
						updatedAt: new Date(),
					},
				});
			await tx
				.insert(recordingMember)
				.values(
					batch.flatMap((r) =>
						r.members.map((m) => ({
							spotifyTrackId: m.spotifyTrackId,
							recordingId: r.id,
							edge: m.edge as "self",
						})),
					),
				)
				.onConflictDoUpdate({
					target: recordingMember.spotifyTrackId,
					set: {
						recordingId: sql`excluded.recording_id`,
						edge: sql`excluded.edge`,
					},
				});
		}
		for (const batch of chunk(releases, BATCH)) {
			await tx
				.insert(release)
				.values(batch.map(({ tracks: _tracks, ...r }) => r))
				.onConflictDoUpdate({
					target: release.id,
					set: {
						title: sql`excluded.title`,
						albumArtist: sql`excluded.album_artist`,
						type: sql`excluded.type`,
						releaseDate: sql`excluded.release_date`,
						isSaved: sql`excluded.is_saved`,
						coverUrl: sql`excluded.cover_url`,
						totalTracks: sql`excluded.total_tracks`,
						updatedAt: new Date(),
					},
				});
			const rows = batch.flatMap((r) =>
				r.tracks.map((t) => ({ releaseId: r.id, ...t })),
			);
			if (rows.length > 0)
				await tx
					.insert(releaseTrack)
					.values(rows)
					.onConflictDoUpdate({
						target: [releaseTrack.releaseId, releaseTrack.recordingId],
						set: {
							discNumber: sql`excluded.disc_number`,
							trackNumber: sql`excluded.track_number`,
						},
					});
		}
		// Recordings that lost every member (a regroup merged them away) are dropped.
		const ids = recordings.map((r) => r.id);
		if (ids.length > 0)
			await tx
				.delete(recording)
				.where(
					and(
						notInArray(recording.id, ids),
						inArray(recording.status, ["pending", "resolved"]),
					),
				);
	});
}

export async function runIdentityResolve() {
	const input = await loadResolveInput();
	const { recordings, releases } = resolveIdentity(input);
	await persistIdentity(recordings, releases);
	return {
		tracks: input.tracks.length,
		recordings: recordings.length,
		releases: releases.length,
		merged: input.tracks.length - recordings.length,
	};
}
