import { z } from "zod";
import type { SlskdRef } from "../providers/slskd";
import type { Candidate, RecordingTarget } from "../providers/types";

// D-011: the LLM only ranks fuzzy candidates. 20b first, 120b when it is unsure; below ACCEPT nothing changes.
export const PICK_ACCEPT = 0.85;
export const PICK_ESCALATE = 0.7;
export const PICK_LIMIT = 50;

export const pickSchema = z.object({
	choice: z
		.number()
		.int()
		.describe(
			"index of the matching candidate, or -1 when none is the exact recording",
		),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("probability the choice is the exact recording"),
	reason: z.string().max(300),
});
export type PickAnswer = z.infer<typeof pickSchema>;

export type PickModel = "candidatePick" | "candidatePickHard";
export type PickAsk = (model: PickModel, prompt: string) => Promise<PickAnswer>;

function describe(candidate: Candidate): string {
	let source = candidate.ref;
	if (candidate.providerId === "slskd") {
		try {
			const ref = JSON.parse(candidate.ref) as SlskdRef;
			source = ref.filename;
		} catch {}
	}
	const quality = candidate.bitDepth
		? `${candidate.format} ${candidate.bitDepth}bit`
		: `${candidate.format} ${candidate.bitrateKbps ?? "?"}kbps`;
	const seconds = candidate.durationMs
		? `${Math.round(candidate.durationMs / 1000)}s`
		: "?s";
	return `${candidate.providerId} | ${source} | ${quality} | ${seconds}`;
}

export function pickPrompt(
	target: RecordingTarget,
	candidates: Candidate[],
): string {
	return [
		"Pick the file that is exactly this recording: same song, same version.",
		"Reject live takes, remixes, edits, covers, karaoke, sped up or other versions unless the target is that version.",
		"",
		`target: ${target.artists.join(", ")} - ${target.title}${target.album ? ` (album: ${target.album})` : ""}, ${Math.round(target.durationMs / 1000)}s`,
		"",
		"candidates (index | source | path or id | quality | length):",
		...candidates.map((c, i) => `${i} | ${describe(c)}`),
		"",
		"Answer with the index (or -1), your confidence from 0 to 1, and a short reason.",
	].join("\n");
}

export type PickDecision = {
	index: number;
	confidence: number;
	model: PickModel;
	reason: string;
} | null;

/** Asks the small model, escalates to the large one when unsure; returns a choice only above PICK_ACCEPT. */
export async function pickCandidate(
	target: RecordingTarget,
	candidates: Candidate[],
	ask: PickAsk,
): Promise<PickDecision> {
	const shown = candidates.slice(0, PICK_LIMIT);
	if (shown.length === 0) return null;
	const prompt = pickPrompt(target, shown);
	let model: PickModel = "candidatePick";
	let answer = await ask(model, prompt);
	if (answer.confidence < PICK_ESCALATE || answer.choice < 0) {
		model = "candidatePickHard";
		answer = await ask(model, prompt);
	}
	if (
		answer.choice < 0 ||
		answer.choice >= shown.length ||
		answer.confidence < PICK_ACCEPT
	)
		return null;
	return {
		index: answer.choice,
		confidence: answer.confidence,
		model,
		reason: answer.reason,
	};
}

/** The picked candidate goes first with its confidence raised to the picker's; the rest keep their order. */
export function applyPick(
	candidates: Candidate[],
	decision: PickDecision,
): Candidate[] {
	if (!decision) return candidates;
	const picked = candidates[decision.index];
	if (!picked) return candidates;
	return [
		{
			...picked,
			matchConfidence: Math.max(picked.matchConfidence, decision.confidence),
		},
		...candidates.filter((_, i) => i !== decision.index),
	];
}
