import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type {
	Candidate,
	Provider,
	RecordingTarget,
} from "../../providers/types";
import type { VerifyResult } from "../../verify/index";
import { acquireRecording, type VerifiedOk } from "../acquire";

const target: RecordingTarget = {
	recordingId: "r1",
	isrcs: ["GBUM71029604"],
	title: "Teardrop",
	artists: ["Massive Attack"],
	album: "Mezzanine",
	durationMs: 330_000,
	spotifyTrackId: "s1",
};

const ok = {
	ok: true,
	facts: {},
	fingerprint: null,
	verdict: "unknown",
	cutoffHz: 21_000,
	verifiedLossless: true,
	effectiveBitDepth: 16,
	upgradeReason: null,
} as unknown as VerifiedOk;

function fakeProvider(
	id: Provider["id"],
	phase: Provider["phase"],
	candidates: Partial<Candidate>[],
	fetchFails = 0,
): Provider & { fetches: string[] } {
	const fetches: string[] = [];
	let failures = fetchFails;
	return {
		id,
		kind: "catalog",
		phase,
		fetches,
		health: async () => ({ ok: true }),
		search: async () =>
			candidates.map(
				(c) =>
					({
						providerId: id,
						format: "flac",
						isrcMatch: false,
						matchConfidence: 0.9,
						ref: "x",
						...c,
					}) as Candidate,
			),
		fetch: async (candidate, dir) => {
			fetches.push(candidate.ref);
			if (failures-- > 0) throw new Error("503");
			const file = path.join(dir, `${candidate.ref}.flac`);
			await writeFile(file, "x");
			return { path: file, candidate };
		},
	};
}

async function deps(
	providers: Provider[],
	verify: (ref: string) => VerifyResult,
) {
	const stagingDir = await mkdtemp(path.join(tmpdir(), "acq-"));
	const placed: string[] = [];
	return {
		placed,
		deps: {
			providers,
			stagingDir,
			guard: async () => null,
			verify: async (_p: string, c: Candidate) => verify(c.ref),
			place: async (_p: string, c: Candidate) => {
				placed.push(c.ref);
				return `/music/lyterion/${c.ref}.flac`;
			},
			sleep: async () => {},
		},
	};
}

describe("acquireRecording", () => {
	it("pauses before searching when the disk guard says so", async () => {
		const provider = fakeProvider("proxy", "B", [{ ref: "a" }]);
		const { deps: d } = await deps([provider], () => ok);
		expect(
			await acquireRecording(target, { ...d, guard: async () => "disk full" }),
		).toEqual({ status: "paused", reason: "disk full" });
		expect(provider.fetches).toEqual([]);
	});

	it("moves down the ranking past a wrong file and places the next one", async () => {
		const proxy = fakeProvider("proxy", "B", [
			{ ref: "exact", isrcMatch: true, matchConfidence: 1 },
		]);
		const slskd = fakeProvider("slskd", "C", [
			{ ref: "p2p", matchConfidence: 0.92 },
		]);
		const { deps: d, placed } = await deps([proxy, slskd], (ref) =>
			ref === "exact"
				? ({ ok: false, reason: "wrong_recording" } as VerifyResult)
				: ok,
		);
		const outcome = await acquireRecording(target, d);
		expect(outcome.status).toBe("placed");
		expect(placed).toEqual(["p2p"]);
		if (outcome.status !== "placed") return;
		expect(
			outcome.attempts.map((a) => [a.candidate.ref, a.state, a.failureReason]),
		).toEqual([
			["exact", "failed", "verify: wrong_recording"],
			["p2p", "chosen", undefined],
		]);
	});

	it("retries a flaky fetch before giving up on a candidate", async () => {
		const proxy = fakeProvider(
			"proxy",
			"B",
			[{ ref: "a", isrcMatch: true, matchConfidence: 1 }],
			2,
		);
		const { deps: d, placed } = await deps([proxy], () => ok);
		expect((await acquireRecording(target, d)).status).toBe("placed");
		expect(proxy.fetches).toEqual(["a", "a", "a"]);
		expect(placed).toEqual(["a"]);
	});

	it("sends near misses to review and empty searches to missing", async () => {
		const slskd = fakeProvider("slskd", "C", [{ ref: "maybe" }]);
		const { deps: d } = await deps(
			[slskd],
			() => ({ ok: false, reason: "low_confidence" }) as VerifyResult,
		);
		expect((await acquireRecording(target, d)).status).toBe("review");

		const empty = fakeProvider("proxy", "B", []);
		const { deps: d2 } = await deps([empty], () => ok);
		expect(await acquireRecording(target, d2)).toMatchObject({
			status: "missing",
			attempts: [],
		});
	});

	it("keeps near misses for review instead of deleting them", async () => {
		const slskd = fakeProvider("slskd", "C", [{ ref: "maybe" }]);
		const { deps: d } = await deps(
			[slskd],
			() => ({ ok: false, reason: "low_confidence" }) as VerifyResult,
		);
		const kept: string[] = [];
		const outcome = await acquireRecording(target, {
			...d,
			keepForReview: async (p) => {
				kept.push(p);
				return `/staging/review/r1/${path.basename(p)}`;
			},
		});
		expect(outcome.status).toBe("review");
		expect(kept).toHaveLength(1);
		if (outcome.status === "placed" || outcome.status === "paused") return;
		expect(outcome.attempts[0]?.stagedPath).toBe(
			"/staging/review/r1/maybe.flac",
		);
	});

	it("lets the picker reorder fuzzy batches and raise the chosen one's confidence", async () => {
		const slskd = fakeProvider("slskd", "C", [
			{ ref: "live", matchConfidence: 0.8 },
			{ ref: "studio", matchConfidence: 0.78 },
		]);
		const seen: string[] = [];
		const { deps: d, placed } = await deps([slskd], () => ok);
		const outcome = await acquireRecording(target, {
			...d,
			verify: async (_p, c) => {
				seen.push(`${c.ref}@${c.matchConfidence}`);
				return c.matchConfidence >= 0.9
					? ok
					: ({ ok: false, reason: "low_confidence" } as VerifyResult);
			},
			pick: async () => ({
				choice: 1,
				confidence: 0.94,
				reason: "album folder",
			}),
		});
		expect(outcome.status).toBe("placed");
		expect(seen).toEqual(["studio@0.94"]);
		expect(placed).toEqual(["studio"]);
	});
});
