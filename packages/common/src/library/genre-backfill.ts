import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { db } from "@lyterion/db";
import { libraryFile, recordingMember } from "@lyterion/db/schema/library";
import { spotifyArtist, spotifyTrack } from "@lyterion/db/schema/spotify";
import { and, eq, isNotNull, sql } from "drizzle-orm";

const run = promisify(execFile);

export type GenreCandidate = { path: string; genres: string[] };

/** The first three, as `buildTags` writes them for files Lyterion places itself. */
export function topGenres(genres: string[]): string[] {
	return genres
		.map((genre) => genre.trim())
		.filter(Boolean)
		.slice(0, 3);
}

/** True when ffprobe's JSON shows a non-empty genre tag, whatever the container calls it. */
export function hasGenreTag(probeJson: string): boolean {
	const data = JSON.parse(probeJson) as {
		format?: { tags?: Record<string, string> };
	};
	return Object.entries(data.format?.tags ?? {}).some(
		([key, value]) => key.toLowerCase() === "genre" && value.trim() !== "",
	);
}

export async function fileHasGenre(path: string): Promise<boolean> {
	const { stdout } = await run("ffprobe", [
		"-v",
		"error",
		"-show_entries",
		"format_tags",
		"-of",
		"json",
		path,
	]);
	return hasGenreTag(stdout);
}

/** Files Lyterion didn't write, matched to a Spotify track whose first artist has genres. Nothing is read from disk here. */
export async function genreCandidates(): Promise<GenreCandidate[]> {
	const rows = await db
		.select({ path: libraryFile.path, genres: spotifyArtist.genres })
		.from(libraryFile)
		.innerJoin(
			recordingMember,
			eq(recordingMember.recordingId, libraryFile.recordingId),
		)
		.innerJoin(
			spotifyTrack,
			eq(spotifyTrack.id, recordingMember.spotifyTrackId),
		)
		.innerJoin(
			spotifyArtist,
			sql`${spotifyArtist.id} = ${spotifyTrack.artistIds}[1]`,
		)
		.where(and(eq(libraryFile.owned, false), isNotNull(libraryFile.path)));
	const byPath = new Map<string, string[]>();
	for (const row of rows) {
		const genres = topGenres(row.genres);
		if (genres.length > 0 && !byPath.has(row.path))
			byPath.set(row.path, genres);
	}
	return [...byPath].map(([path, genres]) => ({ path, genres }));
}
