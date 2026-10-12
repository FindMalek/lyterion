import type { Candidate, Provider, ProviderId, RecordingTarget } from "./types";

// Ranking and phases: D-017 (transparent target) and D-022 (thorough search).
const LOSSLESS = new Set(["flac", "alac", "wav"]);
const TRANSPARENT_KBPS: Record<string, number> = {
	mp3: 240,
	aac: 256,
	opus: 160,
	vorbis: 160,
};
const PHASES = ["A", "B", "C", "D"] as const;

export type QualityClass = "lossless" | "transparent" | "below_transparent";

export function isLossless(candidate: Candidate): boolean {
	return LOSSLESS.has(candidate.format);
}

export function qualityClass(candidate: Candidate): QualityClass {
	if (isLossless(candidate)) return "lossless";
	const line = TRANSPARENT_KBPS[candidate.format];
	if (line !== undefined && (candidate.bitrateKbps ?? 0) >= line)
		return "transparent";
	return "below_transparent";
}

function isExactLossless(candidate: Candidate): boolean {
	return (
		isLossless(candidate) &&
		candidate.isrcMatch &&
		candidate.matchConfidence >= 1
	);
}

export function rankCandidates(
	candidates: Candidate[],
	reliability: Map<ProviderId, number> = new Map(),
): Candidate[] {
	const transparent = (c: Candidate) =>
		Number(qualityClass(c) !== "below_transparent");
	return [...candidates].sort(
		(a, b) =>
			transparent(b) - transparent(a) ||
			b.matchConfidence - a.matchConfidence ||
			Number(isLossless(b)) - Number(isLossless(a)) ||
			(reliability.get(b.providerId) ?? 0.5) -
				(reliability.get(a.providerId) ?? 0.5) ||
			(a.estimatedSeconds ?? Number.POSITIVE_INFINITY) -
				(b.estimatedSeconds ?? Number.POSITIVE_INFINITY),
	);
}

export type SearchResult = {
	candidates: Candidate[];
	errors: { providerId: ProviderId; error: string }[];
	stoppedAfterPhase: (typeof PHASES)[number];
};

export async function searchProviders(
	providers: Provider[],
	target: RecordingTarget,
	reliability?: Map<ProviderId, number>,
): Promise<SearchResult> {
	const candidates: Candidate[] = [];
	const errors: SearchResult["errors"] = [];
	for (const phase of PHASES) {
		const inPhase = providers.filter((p) => p.phase === phase);
		const results = await Promise.allSettled(
			inPhase.map((p) => p.search(target)),
		);
		results.forEach((result, i) => {
			const provider = inPhase[i];
			if (!provider) return;
			if (result.status === "fulfilled") candidates.push(...result.value);
			else
				errors.push({ providerId: provider.id, error: String(result.reason) });
		});
		if (candidates.some(isExactLossless)) {
			return {
				candidates: rankCandidates(candidates, reliability),
				errors,
				stoppedAfterPhase: phase,
			};
		}
	}
	return {
		candidates: rankCandidates(candidates, reliability),
		errors,
		stoppedAfterPhase: "D",
	};
}
