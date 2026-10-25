/** What picking "the best" weighs, as `openReviews` lists a candidate. */
export type Rankable = {
	id: number;
	format: string;
	bitrateKbps: number | null;
	bitDepth: number | null;
	durationMs: number | null;
	matchConfidence: number;
};

const LOSSLESS = new Set(["flac", "alac", "wav", "aiff"]);

/**
 * The candidate a bulk pick takes: the surest match first, then lossless over lossy, then the higher bitrate, then
 * the length closest to the recording's. Null when there are none.
 */
export function bestCandidate<T extends Rankable>(
	candidates: T[],
	durationMs: number | null,
): T | null {
	const delta = (c: T) =>
		c.durationMs == null || durationMs == null
			? Number.POSITIVE_INFINITY
			: Math.abs(c.durationMs - durationMs);
	const lossless = (c: T) => (LOSSLESS.has(c.format.toLowerCase()) ? 1 : 0);
	return (
		[...candidates].sort(
			(a, b) =>
				b.matchConfidence - a.matchConfidence ||
				lossless(b) - lossless(a) ||
				(b.bitDepth ?? 0) - (a.bitDepth ?? 0) ||
				(b.bitrateKbps ?? 0) - (a.bitrateKbps ?? 0) ||
				delta(a) - delta(b),
		)[0] ?? null
	);
}
