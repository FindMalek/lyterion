import type { Candidate, Provider } from "../providers/types";
import type { AcquireTodo } from "./persist";

// docs/providers.md § Album mode: three wanted tracks on one release are worth one album search.
export const ALBUM_MODE_MIN = 3;

export type AcquirePlan = {
	releases: { releaseId: string; recordings: AcquireTodo[] }[];
	singles: AcquireTodo[];
};

export function planAcquire(
	todo: AcquireTodo[],
	albumMode: boolean,
	min = ALBUM_MODE_MIN,
): AcquirePlan {
	if (!albumMode) return { releases: [], singles: todo };
	const byRelease = new Map<string, AcquireTodo[]>();
	for (const r of todo)
		if (r.releaseId)
			byRelease.set(r.releaseId, [...(byRelease.get(r.releaseId) ?? []), r]);
	const releases = [...byRelease]
		.filter(([, recordings]) => recordings.length >= min)
		.map(([releaseId, recordings]) => ({ releaseId, recordings }));
	const grouped = new Set(
		releases.flatMap((r) => r.recordings.map((x) => x.id)),
	);
	return { releases, singles: todo.filter((r) => !grouped.has(r.id)) };
}

// A track the album search found skips its own search on that provider; one it missed still searches.
export function withAlbumResults(
	providers: Provider[],
	album: Provider | undefined,
	found: Candidate[] | undefined,
): Provider[] {
	if (!album || !found || found.length === 0) return providers;
	return providers.map((p) =>
		p === album ? { ...p, search: async () => found } : p,
	);
}
