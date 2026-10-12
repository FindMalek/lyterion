import path from "node:path";

import { db } from "@lyterion/db";
import { libraryFile, recording } from "@lyterion/db/schema/library";
import { inArray, sql } from "drizzle-orm";

import type { NavidromeClient } from "./client";
import { matchExisting } from "./index";

// Existing files are read-only input (D-012): recorded with owned = false and never moved or deleted.
export async function indexExistingLibrary(
	client: NavidromeClient,
	options: { musicDir: string; librarySubdir: string },
): Promise<{ songs: number; existing: number }> {
	const [songs, recordings] = await Promise.all([
		client.allSongs(),
		db
			.select({
				id: recording.id,
				isrcs: recording.isrcs,
				mbRecordingId: recording.mbRecordingId,
				title: recording.title,
				artists: recording.artists,
				durationMs: recording.durationMs,
			})
			.from(recording)
			.where(
				inArray(recording.status, [
					"pending",
					"resolved",
					"missing",
					"existing",
				]),
			),
	]);
	const matches = matchExisting(recordings, songs, options.librarySubdir);
	if (matches.size === 0) return { songs: songs.length, existing: 0 };
	await db.transaction(async (tx) => {
		for (const [recordingId, song] of matches) {
			await tx
				.insert(libraryFile)
				.values({
					recordingId,
					path: path.join(options.musicDir, song.path ?? ""),
					owned: false,
					codec: (song.suffix ?? "unknown").toLowerCase(),
					bitrateKbps: song.bitRate ?? null,
					bitDepth: song.bitDepth ?? null,
					sampleRateHz: song.samplingRate ?? null,
					durationMs: (song.duration ?? 0) * 1000,
					navidromeSongId: song.id,
				})
				.onConflictDoUpdate({
					target: libraryFile.path,
					set: {
						recordingId: sql`excluded.recording_id`,
						navidromeSongId: sql`excluded.navidrome_song_id`,
					},
				});
		}
		await tx
			.update(recording)
			.set({ status: "existing", updatedAt: new Date() })
			.where(inArray(recording.id, [...matches.keys()]));
	});
	return { songs: songs.length, existing: matches.size };
}
