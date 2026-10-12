// Rules: docs/matching.md § 2 Placement, D-006, D-018.

export type ReleaseType = "album" | "ep" | "single" | "compilation";

export type PlacementRelease = {
	id: string;
	title: string;
	type: ReleaseType;
	releaseDate: string | null;
	saved: boolean;
	recordingIds: string[];
};

export type SavedAlbumPolicy = "keep-complete" | "collapse";

export type PlacementInput = {
	recordingIds: string[];
	releases: PlacementRelease[];
	existingRecordingIds?: Set<string>;
	previous?: Map<string, string[]>;
	savedAlbumPolicy?: SavedAlbumPolicy;
};

export type Placement =
	| { kind: "existing" }
	| {
			kind: "release";
			releaseIds: string[];
			reason: "saved" | "sticky" | "scored";
	  };

const TYPE_SCORE: Record<ReleaseType, number> = {
	album: 3,
	ep: 2,
	single: 1,
	compilation: 0,
};
const EDITION =
	/\b(deluxe|expanded|anniversary|special|bonus|collector'?s|super)\b/i;

function compareReleases(cohesion: Map<string, number>) {
	return (a: PlacementRelease, b: PlacementRelease): number =>
		(cohesion.get(b.id) ?? 0) - (cohesion.get(a.id) ?? 0) ||
		TYPE_SCORE[b.type] - TYPE_SCORE[a.type] ||
		Number(EDITION.test(a.title)) - Number(EDITION.test(b.title)) ||
		(a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999") ||
		a.id.localeCompare(b.id);
}

export function placeRecordings(input: PlacementInput): Map<string, Placement> {
	const wanted = new Set(input.recordingIds);
	const policy = input.savedAlbumPolicy ?? "keep-complete";
	const cohesion = new Map(
		input.releases.map((r) => [
			r.id,
			r.recordingIds.filter((id) => wanted.has(id)).length,
		]),
	);
	const byRecording = new Map<string, PlacementRelease[]>();
	for (const release of input.releases) {
		for (const id of release.recordingIds) {
			if (!wanted.has(id)) continue;
			byRecording.set(id, [...(byRecording.get(id) ?? []), release]);
		}
	}
	const compare = compareReleases(cohesion);
	const placements = new Map<string, Placement>();

	for (const recordingId of input.recordingIds) {
		if (input.existingRecordingIds?.has(recordingId)) {
			placements.set(recordingId, { kind: "existing" });
			continue;
		}
		const releases = byRecording.get(recordingId) ?? [];
		const saved = releases.filter((r) => r.saved).sort(compare);
		const previous = input.previous
			?.get(recordingId)
			?.filter((id) => releases.some((r) => r.id === id));
		const previousIsSaved =
			previous?.some((id) => saved.some((r) => r.id === id)) ?? false;

		if (
			saved.length > 0 &&
			(!previous?.length || !previousIsSaved || policy === "keep-complete")
		) {
			const ids =
				policy === "keep-complete"
					? saved.map((r) => r.id)
					: saved.slice(0, 1).map((r) => r.id);
			placements.set(recordingId, {
				kind: "release",
				releaseIds: ids,
				reason: "saved",
			});
			continue;
		}
		if (previous?.length) {
			placements.set(recordingId, {
				kind: "release",
				releaseIds: previous,
				reason: "sticky",
			});
			continue;
		}
		const [best] = [...releases].sort(compare);
		if (best)
			placements.set(recordingId, {
				kind: "release",
				releaseIds: [best.id],
				reason: "scored",
			});
	}
	return placements;
}
