import path from "node:path";

import { db } from "@lyterion/db";
import {
	libraryFile,
	recording,
	recordingMember,
} from "@lyterion/db/schema/library";
import {
	librarySave,
	playlistEntry,
	spotifyTrack,
} from "@lyterion/db/schema/spotify";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { loadAcquireJob } from "../acquire/persist";
import { libraryRelativePath } from "../library/layout";

export type ReconcileMove = {
	fileId: number;
	recordingId: string;
	title: string;
	from: string;
	to: string;
};
export type ReconcileRemoval = {
	fileId: number;
	title: string | null;
	path: string;
};
export type ReconcilePlan = {
	moves: ReconcileMove[];
	removals: ReconcileRemoval[];
};

/** Recordings something on Spotify still points at: a like, a saved album's track, or a playlist entry. */
async function referencedRecordings(): Promise<Set<string>> {
	const [liked, savedAlbums, entries, members] = await Promise.all([
		db
			.select({ id: librarySave.spotifyId })
			.from(librarySave)
			.where(
				and(eq(librarySave.kind, "liked_track"), isNull(librarySave.removedAt)),
			),
		db
			.select({ id: librarySave.spotifyId })
			.from(librarySave)
			.where(
				and(eq(librarySave.kind, "saved_album"), isNull(librarySave.removedAt)),
			),
		db.select({ id: playlistEntry.spotifyTrackId }).from(playlistEntry),
		db.select().from(recordingMember),
	]);
	const albumIds = savedAlbums.map((a) => a.id);
	const albumTracks = albumIds.length
		? await db
				.select({ id: spotifyTrack.id })
				.from(spotifyTrack)
				.where(inArray(spotifyTrack.albumId, albumIds))
		: [];
	const recordingOf = new Map(
		members.map((m) => [m.spotifyTrackId, m.recordingId]),
	);
	const refs = new Set<string>();
	for (const { id } of [...liked, ...albumTracks, ...entries]) {
		const rec = id ? recordingOf.get(id) : undefined;
		if (rec) refs.add(rec);
	}
	return refs;
}

// D-012: only files Lyterion wrote, and only inside its own subtree.
export function insideLibrary(
	file: string,
	musicDir: string,
	librarySubdir: string,
): boolean {
	const root = path.resolve(musicDir, librarySubdir) + path.sep;
	return path.resolve(file).startsWith(root);
}

export async function reconcilePlan(options: {
	musicDir: string;
	librarySubdir: string;
}): Promise<ReconcilePlan> {
	const [files, refs] = await Promise.all([
		db
			.select({
				id: libraryFile.id,
				path: libraryFile.path,
				recordingId: libraryFile.recordingId,
				title: recording.title,
			})
			.from(libraryFile)
			.leftJoin(recording, eq(recording.id, libraryFile.recordingId))
			.where(eq(libraryFile.owned, true)),
		referencedRecordings(),
	]);
	const plan: ReconcilePlan = { moves: [], removals: [] };
	for (const file of files) {
		if (!insideLibrary(file.path, options.musicDir, options.librarySubdir))
			continue;
		if (!file.recordingId || !refs.has(file.recordingId)) {
			plan.removals.push({
				fileId: file.id,
				title: file.title,
				path: file.path,
			});
			continue;
		}
		const job = await loadAcquireJob(file.recordingId);
		if (!job) continue;
		const { target, placement } = job;
		const expected = path.join(
			options.musicDir,
			options.librarySubdir,
			libraryRelativePath({
				albumArtist: placement.albumArtist,
				artist: target.artists[0] ?? "Unknown Artist",
				album: placement.album,
				title: target.title,
				year: placement.year,
				trackNumber: placement.trackNumber,
				discNumber: placement.discNumber,
				discTotal: placement.discTotal,
				compilation: placement.type === "compilation",
				extension: path.extname(file.path).slice(1),
			}),
		);
		if (path.resolve(expected) !== path.resolve(file.path))
			plan.moves.push({
				fileId: file.id,
				recordingId: file.recordingId,
				title: target.title,
				from: file.path,
				to: expected,
			});
	}
	return plan;
}
