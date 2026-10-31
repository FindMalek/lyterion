import { normalizeArtist, parseTitle } from "./normalize";

// Rules: docs/matching.md § 1 Identity, D-006, D-027.
const DURATION_TOLERANCE_MS = 3_000;

export type GroupTrack = {
	id: string;
	isrc: string | null;
	title: string;
	artists: string[];
	durationMs: number;
	explicit: boolean;
	popularity?: number;
	mbRecordingId?: string | null;
};

export type GroupEdgeKind = "isrc" | "mb" | "fuzzy" | "fingerprint" | "manual";

export type GroupOverride = {
	kind: "merge" | "split";
	trackIds: [string, string];
};

export type RecordingGroup = {
	memberIds: string[];
	preferredId: string;
	edges: { from: string; to: string; kind: GroupEdgeKind }[];
};

type Edge = { from: string; to: string; kind: GroupEdgeKind };

function fuzzyKey(track: GroupTrack): string {
	const parsed = parseTitle(track.title);
	const artist = normalizeArtist(track.artists[0] ?? "");
	return `${artist}|${parsed.base}|${[...parsed.flags].sort().join(",")}`;
}

function collectEdges(
	tracks: GroupTrack[],
	fingerprintPairs: [string, string][],
): Edge[] {
	const edges: Edge[] = [];
	const byKey = new Map<string, Map<string, GroupTrack[]>>([
		["isrc", new Map()],
		["mb", new Map()],
		["fuzzy", new Map()],
	]);
	for (const track of tracks) {
		const keys: [string, string | null | undefined][] = [
			["isrc", track.isrc?.toUpperCase()],
			["mb", track.mbRecordingId],
			["fuzzy", fuzzyKey(track)],
		];
		for (const [kind, key] of keys) {
			if (!key) continue;
			const bucket = byKey.get(kind);
			const list = bucket?.get(key) ?? [];
			list.push(track);
			bucket?.set(key, list);
		}
	}
	for (const kind of ["isrc", "mb", "fuzzy"] as const) {
		for (const list of byKey.get(kind)?.values() ?? []) {
			for (let i = 0; i < list.length; i++) {
				for (let j = i + 1; j < list.length; j++) {
					const a = list[i];
					const b = list[j];
					if (!a || !b) continue;
					if (
						kind === "fuzzy" &&
						(!a.durationMs ||
							!b.durationMs ||
							Math.abs(a.durationMs - b.durationMs) > DURATION_TOLERANCE_MS)
					)
						continue;
					edges.push({ from: a.id, to: b.id, kind });
				}
			}
		}
	}
	for (const [from, to] of fingerprintPairs)
		edges.push({ from, to, kind: "fingerprint" });
	return edges;
}

function preferred(members: GroupTrack[]): string {
	const [best] = [...members].sort(
		(a, b) =>
			Number(b.explicit) - Number(a.explicit) ||
			(b.popularity ?? 0) - (a.popularity ?? 0) ||
			a.id.localeCompare(b.id),
	);
	return best?.id ?? "";
}

export function groupRecordings(
	tracks: GroupTrack[],
	options: {
		overrides?: GroupOverride[];
		fingerprintPairs?: [string, string][];
	} = {},
): RecordingGroup[] {
	const parent = new Map(tracks.map((t) => [t.id, t.id]));
	const members = new Map(tracks.map((t) => [t.id, new Set([t.id])]));

	function find(id: string): string {
		let root = id;
		while (parent.get(root) !== root) root = parent.get(root) ?? root;
		parent.set(id, root);
		return root;
	}

	const splits = (options.overrides ?? []).filter((o) => o.kind === "split");
	function violatesSplit(a: Set<string>, b: Set<string>): boolean {
		return splits.some(
			({ trackIds: [x, y] }) =>
				(a.has(x) && b.has(y)) || (a.has(y) && b.has(x)),
		);
	}

	const manual: Edge[] = (options.overrides ?? [])
		.filter((o) => o.kind === "merge")
		.map(({ trackIds: [from, to] }) => ({ from, to, kind: "manual" }));
	const accepted: Edge[] = [];
	for (const edge of [
		...manual,
		...collectEdges(tracks, options.fingerprintPairs ?? []),
	]) {
		if (!parent.has(edge.from) || !parent.has(edge.to)) continue;
		const ra = find(edge.from);
		const rb = find(edge.to);
		if (ra === rb) continue;
		const ma = members.get(ra) ?? new Set<string>();
		const mb = members.get(rb) ?? new Set<string>();
		if (violatesSplit(ma, mb)) continue;
		parent.set(rb, ra);
		for (const id of mb) ma.add(id);
		members.delete(rb);
		accepted.push(edge);
	}

	const byId = new Map(tracks.map((t) => [t.id, t]));
	return [...members.values()].map((ids) => {
		const memberIds = [...ids].sort();
		return {
			memberIds,
			preferredId: preferred(memberIds.flatMap((id) => byId.get(id) ?? [])),
			edges: accepted.filter((e) => ids.has(e.from)),
		};
	});
}
