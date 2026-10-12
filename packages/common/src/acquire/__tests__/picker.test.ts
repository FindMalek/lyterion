import { describe, expect, it } from "vitest";

import type { Candidate, RecordingTarget } from "../../providers/types";
import {
	applyPick,
	type PickAnswer,
	type PickModel,
	pickCandidate,
	pickPrompt,
} from "../picker";

const target: RecordingTarget = {
	recordingId: "r1",
	isrcs: [],
	title: "Teardrop",
	artists: ["Massive Attack"],
	album: "Mezzanine",
	durationMs: 330_000,
	spotifyTrackId: null,
};
const cand = (ref: string, conf = 0.8): Candidate => ({
	providerId: "slskd",
	ref: JSON.stringify({ username: "u", filename: ref, size: 1 }),
	format: "flac",
	isrcMatch: false,
	matchConfidence: conf,
	durationMs: 330_000,
});
const candidates = [
	cand("Massive Attack\\Live\\Teardrop.flac"),
	cand("Massive Attack\\Mezzanine\\03 Teardrop.flac"),
];

function asker(answers: Partial<Record<PickModel, PickAnswer>>) {
	const asked: PickModel[] = [];
	return {
		asked,
		ask: async (model: PickModel) => {
			asked.push(model);
			const a = answers[model];
			if (!a) throw new Error("unexpected");
			return a;
		},
	};
}

describe("pickPrompt", () => {
	it("lists the target and every candidate path by index", () => {
		const prompt = pickPrompt(target, candidates);
		expect(prompt).toContain(
			"target: Massive Attack - Teardrop (album: Mezzanine), 330s",
		);
		expect(prompt).toContain(
			"1 | slskd | Massive Attack\\Mezzanine\\03 Teardrop.flac | flac ?kbps | 330s",
		);
	});
});

describe("pickCandidate", () => {
	it("takes a confident small-model answer without escalating", async () => {
		const { ask, asked } = asker({
			candidatePick: { choice: 1, confidence: 0.95, reason: "album folder" },
		});
		expect(await pickCandidate(target, candidates, ask)).toMatchObject({
			index: 1,
			confidence: 0.95,
			model: "candidatePick",
		});
		expect(asked).toEqual(["candidatePick"]);
	});

	it("escalates when unsure and drops answers under the accept line", async () => {
		const sure = asker({
			candidatePick: { choice: 0, confidence: 0.5, reason: "?" },
			candidatePickHard: { choice: 1, confidence: 0.9, reason: "studio take" },
		});
		expect(await pickCandidate(target, candidates, sure.ask)).toMatchObject({
			index: 1,
			model: "candidatePickHard",
		});
		expect(sure.asked).toEqual(["candidatePick", "candidatePickHard"]);

		const unsure = asker({
			candidatePick: { choice: -1, confidence: 0.9, reason: "none" },
			candidatePickHard: { choice: 1, confidence: 0.6, reason: "maybe" },
		});
		expect(await pickCandidate(target, candidates, unsure.ask)).toBeNull();
	});

	it("ignores out-of-range choices", async () => {
		const { ask } = asker({
			candidatePick: { choice: 7, confidence: 0.99, reason: "" },
		});
		expect(await pickCandidate(target, candidates, ask)).toBeNull();
	});
});

describe("applyPick", () => {
	it("moves the pick first with its confidence raised", () => {
		const out = applyPick(candidates, {
			index: 1,
			confidence: 0.93,
			model: "candidatePick",
			reason: "",
		});
		expect(out.map((c) => c.ref)).toEqual([
			candidates[1]?.ref,
			candidates[0]?.ref,
		]);
		expect(out[0]?.matchConfidence).toBe(0.93);
		expect(applyPick(candidates, null)).toBe(candidates);
	});
});
