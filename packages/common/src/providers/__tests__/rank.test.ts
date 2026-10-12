import { describe, expect, it } from "vitest";

import { rankCandidates, searchProviders } from "../rank";
import type { Candidate, Provider, RecordingTarget } from "../types";

function candidate(ref: string, overrides: Partial<Candidate> = {}): Candidate {
	return {
		providerId: "slskd",
		ref,
		format: "flac",
		isrcMatch: false,
		matchConfidence: 0.9,
		...overrides,
	};
}

const target: RecordingTarget = {
	recordingId: "r1",
	isrcs: ["USUG11904206"],
	title: "Blinding Lights",
	artists: ["The Weeknd"],
	album: "After Hours",
	durationMs: 200_000,
	spotifyTrackId: "0VjIjW4GlUZAMYd2vXMi3b",
};

describe("rankCandidates", () => {
	it("ranks transparent before match, match before lossless, then speed", () => {
		const ranked = rankCandidates([
			candidate("opus75-exact", {
				format: "opus",
				bitrateKbps: 75,
				isrcMatch: true,
				matchConfidence: 1,
			}),
			candidate("flac-fuzzy", { matchConfidence: 0.8 }),
			candidate("vorbis160-exact", {
				providerId: "anna",
				format: "vorbis",
				bitrateKbps: 160,
				matchConfidence: 1,
			}),
			candidate("flac-exact-slow", {
				matchConfidence: 1,
				estimatedSeconds: 300,
			}),
			candidate("flac-exact-fast", { matchConfidence: 1, estimatedSeconds: 5 }),
		]);
		expect(ranked.map((c) => c.ref)).toEqual([
			"flac-exact-fast",
			"flac-exact-slow",
			"vorbis160-exact",
			"flac-fuzzy",
			"opus75-exact",
		]);
	});
});

describe("searchProviders", () => {
	function provider(
		id: Provider["id"],
		phase: Provider["phase"],
		results: Candidate[] | Error,
	): Provider & { calls: number } {
		return {
			id,
			kind: "catalog",
			phase,
			calls: 0,
			health: async () => ({ ok: true }),
			async search() {
				this.calls++;
				if (results instanceof Error) throw results;
				return results;
			},
			fetch: async () => {
				throw new Error("not used");
			},
		};
	}

	it("stops after the phase that found an exact lossless hit and survives a failing provider", async () => {
		const library = provider("library", "A", []);
		const proxy = provider("proxy", "B", [
			candidate("isrc-flac", {
				providerId: "proxy",
				isrcMatch: true,
				matchConfidence: 1,
			}),
		]);
		const deezer = provider("deezer", "B", new Error("arl expired"));
		const slskd = provider("slskd", "C", [candidate("p2p")]);

		const result = await searchProviders(
			[library, proxy, deezer, slskd],
			target,
		);

		expect(result.stoppedAfterPhase).toBe("B");
		expect(result.candidates.map((c) => c.ref)).toEqual(["isrc-flac"]);
		expect(result.errors).toEqual([
			{ providerId: "deezer", error: "Error: arl expired" },
		]);
		expect(slskd.calls).toBe(0);
	});
});
