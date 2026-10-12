import { db } from "@lyterion/db";
import { libraryFile, releaseTrack } from "@lyterion/db/schema/library";
import { and, asc, eq } from "drizzle-orm";

import { measureAlbumLoudness, replayGainTags } from "./extras";
import { writeTags } from "./place";

export type AlbumGainResult =
	| { status: "incomplete"; have: number; want: number }
	| { status: "written"; files: number; gain: string }
	| { status: "unmeasured" };

/** Album ReplayGain once every track of a release has a Lyterion file; reruns after an upgrade swap (#45). */
export async function applyAlbumGain(
	releaseId: string,
	python = "python3",
): Promise<AlbumGainResult> {
	const [tracks, files] = await Promise.all([
		db
			.select({
				recordingId: releaseTrack.recordingId,
				disc: releaseTrack.discNumber,
				track: releaseTrack.trackNumber,
			})
			.from(releaseTrack)
			.where(eq(releaseTrack.releaseId, releaseId))
			.orderBy(asc(releaseTrack.discNumber), asc(releaseTrack.trackNumber)),
		db
			.select({ recordingId: libraryFile.recordingId, path: libraryFile.path })
			.from(libraryFile)
			.where(
				and(eq(libraryFile.releaseId, releaseId), eq(libraryFile.owned, true)),
			),
	]);
	const pathOf = new Map(files.map((f) => [f.recordingId, f.path]));
	const paths = tracks.flatMap((t) => pathOf.get(t.recordingId) ?? []);
	if (tracks.length === 0 || paths.length < tracks.length)
		return { status: "incomplete", have: paths.length, want: tracks.length };
	const loudness = await measureAlbumLoudness(paths);
	if (!loudness) return { status: "unmeasured" };
	const tags = replayGainTags(loudness, "ALBUM");
	for (const path of paths) await writeTags(path, tags, null, python, true);
	return {
		status: "written",
		files: paths.length,
		gain: tags.REPLAYGAIN_ALBUM_GAIN?.[0] ?? "",
	};
}

// An extra like track gain: a failure is logged by the caller's result, never fails the placement.
export async function albumGainAfterPlace(
	releaseId: string | null,
	python?: string,
): Promise<AlbumGainResult | null> {
	if (!releaseId) return null;
	return applyAlbumGain(releaseId, python).catch(() => null);
}
