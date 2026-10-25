import { describe, expect, it } from "vitest";

import { bestCandidate } from "../best";

const c = (
	id: number,
	matchConfidence: number,
	format: string,
	bitrateKbps: number | null,
	durationMs: number | null,
) => ({
	id,
	matchConfidence,
	format,
	bitrateKbps,
	bitDepth: null,
	durationMs,
});

describe("bestCandidate", () => {
	it("takes the surest match, then lossless, then bitrate, then the closest length", () => {
		expect(
			bestCandidate(
				[c(1, 0.7, "flac", null, 200_000), c(2, 0.9, "mp3", 320, 200_000)],
				200_000,
			)?.id,
		).toBe(2);
		expect(
			bestCandidate(
				[c(1, 0.9, "mp3", 320, 200_000), c(2, 0.9, "FLAC", null, 200_000)],
				200_000,
			)?.id,
		).toBe(2);
		expect(
			bestCandidate(
				[c(1, 0.9, "mp3", 256, 200_000), c(2, 0.9, "mp3", 320, 200_000)],
				200_000,
			)?.id,
		).toBe(2);
		expect(
			bestCandidate(
				[c(1, 0.9, "mp3", 320, 230_000), c(2, 0.9, "mp3", 320, 201_000)],
				200_000,
			)?.id,
		).toBe(2);
	});

	it("is null with nothing to pick", () => {
		expect(bestCandidate([], 200_000)).toBeNull();
	});
});
