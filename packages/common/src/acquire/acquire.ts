import { rm } from "node:fs/promises";

import { rankCandidates, searchProviders } from "../providers/rank";
import type {
	Candidate,
	Provider,
	ProviderId,
	RecordingTarget,
} from "../providers/types";
import { GiveUpError } from "../providers/types";
import type { VerifyResult } from "../verify/index";
import { applyPick, type PickAsk, pickCandidate } from "./picker";

// One recording: search, then fetch → verify → place down the ranked list (docs/pipeline.md § Failure handling).
const MAX_ATTEMPTS = 5;
const FETCH_RETRIES = 2;
const PHASE_ORDER = ["A", "B", "C", "D"];

export type VerifiedOk = Extract<VerifyResult, { ok: true }>;

export type AttemptLog = {
	candidate: Candidate;
	rank: number;
	state: "new" | "failed" | "chosen";
	failureReason?: string;
	stagedPath?: string;
};

export type AcquireOutcome =
	| { status: "paused"; reason: string }
	| {
			status: "placed";
			path: string;
			chosen: Candidate;
			verify: VerifiedOk;
			attempts: AttemptLog[];
	  }
	| { status: "missing" | "review"; attempts: AttemptLog[]; errors: string[] };

export type AcquireDeps = {
	providers: Provider[];
	stagingDir: string;
	guard: () => Promise<string | null>;
	verify: (path: string, candidate: Candidate) => Promise<VerifyResult>;
	place: (
		path: string,
		candidate: Candidate,
		verify: VerifiedOk,
	) => Promise<string>;
	/** LLM picker for batches with no exact ISRC hit (D-011); without it the ranking stands. */
	pick?: PickAsk;
	/** Moves a near miss somewhere the review queue can play it; without it near misses are deleted. */
	keepForReview?: (path: string, candidate: Candidate) => Promise<string>;
	reliability?: Map<ProviderId, number>;
	maxAttempts?: number;
	fetchRetries?: number;
	sleep?: (ms: number) => Promise<void>;
};

function message(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function providerFor(providers: Provider[], candidate: Candidate): Provider {
	const provider = providers.find((p) => p.id === candidate.providerId);
	if (!provider) throw new Error(`no provider ${candidate.providerId}`);
	return provider;
}

async function fetchWithRetries(
	deps: AcquireDeps,
	candidate: Candidate,
): Promise<{ path: string } | { error: string }> {
	const retries = deps.fetchRetries ?? FETCH_RETRIES;
	const sleep =
		deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	let lastError = "";
	for (let tryNo = 0; tryNo <= retries; tryNo++) {
		try {
			const file = await providerFor(deps.providers, candidate).fetch(
				candidate,
				deps.stagingDir,
			);
			return { path: file.path };
		} catch (error) {
			lastError = message(error);
			if (error instanceof GiveUpError) break;
			if (tryNo < retries) await sleep(2_000 * 2 ** tryNo);
		}
	}
	return { error: lastError };
}

export async function acquireRecording(
	target: RecordingTarget,
	deps: AcquireDeps,
): Promise<AcquireOutcome> {
	const paused = await deps.guard();
	if (paused) return { status: "paused", reason: paused };

	const attempts: AttemptLog[] = [];
	const errors: string[] = [];
	let cameClose = false;
	let budget = deps.maxAttempts ?? MAX_ATTEMPTS;
	let remaining = deps.providers;

	// The search stops early on an exact lossless hit; if that file fails, the later phases still get searched.
	while (remaining.length > 0 && budget > 0) {
		const search = await searchProviders(remaining, target, deps.reliability);
		errors.push(...search.errors.map((e) => `${e.providerId}: ${e.error}`));
		const stopped = PHASE_ORDER.indexOf(search.stoppedAfterPhase);
		remaining = remaining.filter((p) => PHASE_ORDER.indexOf(p.phase) > stopped);
		let ranked = rankCandidates(search.candidates, deps.reliability);
		if (
			deps.pick &&
			ranked.length > 0 &&
			!ranked.some((c) => c.isrcMatch && c.matchConfidence >= 1)
		) {
			try {
				ranked = applyPick(
					ranked,
					await pickCandidate(target, ranked, deps.pick),
				);
			} catch (error) {
				errors.push(`picker: ${message(error)}`);
			}
		}
		const batch = ranked.map(
			(candidate, i): AttemptLog => ({
				candidate,
				rank: attempts.length + i,
				state: "new",
			}),
		);
		attempts.push(...batch);

		for (const attempt of batch.slice(0, budget)) {
			budget--;
			const fetched = await fetchWithRetries(deps, attempt.candidate);
			if ("error" in fetched) {
				attempt.state = "failed";
				attempt.failureReason = `fetch: ${fetched.error}`;
				continue;
			}
			try {
				const verdict = await deps.verify(fetched.path, attempt.candidate);
				if (!verdict.ok) {
					attempt.state = "failed";
					attempt.failureReason = `verify: ${verdict.reason}`;
					if (verdict.reason === "low_confidence") {
						cameClose = true;
						if (deps.keepForReview) {
							attempt.stagedPath = await deps.keepForReview(
								fetched.path,
								attempt.candidate,
							);
							continue;
						}
					}
					await rm(fetched.path, { force: true });
					continue;
				}
				const path = await deps.place(fetched.path, attempt.candidate, verdict);
				attempt.state = "chosen";
				return {
					status: "placed",
					path,
					chosen: attempt.candidate,
					verify: verdict,
					attempts,
				};
			} catch (error) {
				attempt.state = "failed";
				attempt.failureReason = `place: ${message(error)}`;
				await rm(fetched.path, { force: true });
			}
		}
	}
	// A plausible file that only lacked proof goes to the owner instead of being dropped.
	return { status: cameClose ? "review" : "missing", attempts, errors };
}
