import { qualityClass } from "../providers/rank";
import type { Candidate } from "../providers/types";
import {
	type AcoustidResult,
	type FingerprintVerdict,
	fingerprintVerdict,
} from "./acoustid";
import {
	type AudioFacts,
	decodesCleanly,
	type Fingerprint,
	fingerprint,
	isPadded24Bit,
	probe,
	spectralCutoffHz,
} from "./audio";

export * from "./acoustid";
export * from "./audio";

// Steps and thresholds: docs/verification.md, upgrade reasons: D-023.
// LAME 320 transcodes measure ~20.3 kHz, real CD masters 21-22 kHz.
const LOSSLESS_MIN_CUTOFF_HZ = 20_500;
const HIGH_BITRATE_MIN_CUTOFF_HZ = 17_000;
const UNVERIFIED_MIN_CONFIDENCE = 0.9;

export type UpgradeReason =
	| "below_transparent"
	| "fake_lossless"
	| "fake_bitrate"
	| "unverified_match"
	| "youtube_source";

export type VerifyExpectation = {
	durationMs: number;
	mbRecordingIds: string[];
	candidate: Candidate;
};

export type VerifyResult =
	| {
			ok: false;
			reason: "corrupt" | "duration" | "wrong_recording" | "low_confidence";
			facts?: AudioFacts;
	  }
	| {
			ok: true;
			facts: AudioFacts;
			fingerprint: Fingerprint | null;
			verdict: FingerprintVerdict;
			cutoffHz: number;
			verifiedLossless: boolean;
			effectiveBitDepth: number | null;
			upgradeReason: UpgradeReason | null;
	  };

export type VerifyDeps = {
	lookupFingerprint?: (fp: Fingerprint) => Promise<AcoustidResult[]>;
};

function durationToleranceMs(candidate: Candidate): number {
	return candidate.providerId === "youtube" ? 4_000 : 2_000;
}

export async function verifyFile(
	path: string,
	expect: VerifyExpectation,
	deps: VerifyDeps = {},
): Promise<VerifyResult> {
	if (!(await decodesCleanly(path))) return { ok: false, reason: "corrupt" };
	const facts = await probe(path);
	if (
		Math.abs(facts.durationMs - expect.durationMs) >
		durationToleranceMs(expect.candidate)
	) {
		return { ok: false, reason: "duration", facts };
	}

	let fp: Fingerprint | null = null;
	let verdict: FingerprintVerdict = "unknown";
	if (deps.lookupFingerprint) {
		fp = await fingerprint(path);
		verdict = fingerprintVerdict(
			await deps.lookupFingerprint(fp),
			expect.mbRecordingIds,
		);
	}
	if (verdict === "mismatch")
		return { ok: false, reason: "wrong_recording", facts };
	if (
		verdict === "unknown" &&
		expect.candidate.matchConfidence < UNVERIFIED_MIN_CONFIDENCE
	) {
		return { ok: false, reason: "low_confidence", facts };
	}

	const cutoffHz = await spectralCutoffHz(path, facts);
	const claimedLossless = qualityClass(expect.candidate) === "lossless";
	const verifiedLossless =
		claimedLossless && cutoffHz >= LOSSLESS_MIN_CUTOFF_HZ;
	const effectiveBitDepth = (await isPadded24Bit(path, facts))
		? 16
		: facts.bitDepth;

	let upgradeReason: UpgradeReason | null = null;
	if (claimedLossless && !verifiedLossless) upgradeReason = "fake_lossless";
	else if (
		!claimedLossless &&
		(facts.bitrateKbps ?? 0) >= 256 &&
		cutoffHz < HIGH_BITRATE_MIN_CUTOFF_HZ
	)
		upgradeReason = "fake_bitrate";
	else if (
		!claimedLossless &&
		qualityClass({
			...expect.candidate,
			bitrateKbps: facts.bitrateKbps ?? expect.candidate.bitrateKbps,
		}) === "below_transparent"
	)
		upgradeReason = "below_transparent";
	else if (verdict === "unknown" && expect.candidate.matchConfidence < 1)
		upgradeReason = "unverified_match";
	else if (expect.candidate.providerId === "youtube")
		upgradeReason = "youtube_source";

	return {
		ok: true,
		facts,
		fingerprint: fp,
		verdict,
		cutoffHz,
		verifiedLossless,
		effectiveBitDepth,
		upgradeReason,
	};
}
