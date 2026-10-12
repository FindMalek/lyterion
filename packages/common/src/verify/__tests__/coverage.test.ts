import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { audioFiles, measureCoverage, sample } from "../coverage";

describe("acoustid coverage", () => {
	it("finds audio files recursively", async () => {
		const root = mkdtempSync(join(tmpdir(), "lyterion-cov-"));
		mkdirSync(join(root, "user/Album"), { recursive: true });
		for (const f of [
			"user/Album/01.flac",
			"user/Album/02.MP3",
			"user/Album/cover.jpg",
		])
			writeFileSync(join(root, f), "");
		expect((await audioFiles(root)).sort()).toEqual([
			join(root, "user/Album/01.flac"),
			join(root, "user/Album/02.MP3"),
		]);
	});

	it("samples without repeats", () => {
		const picked = sample([1, 2, 3, 4, 5], 3);
		expect(new Set(picked).size).toBe(3);
		expect(sample([1, 2], 5)).toHaveLength(2);
	});

	it("counts known, fingerprint-only, unknown and errors like the verifier", async () => {
		const answers: Record<string, unknown> = {
			"a.flac": [{ score: 0.95, recordingIds: ["r1"] }],
			"b.flac": [{ score: 0.8, recordingIds: [] }],
			"c.mp3": [],
			"d.mp3": [{ score: 0.3, recordingIds: ["r2"] }],
			"e.mp3": new Error("boom"),
		};
		const report = await measureCoverage(Object.keys(answers), {
			fingerprint: async (file) => ({ fingerprint: file, durationSec: 1 }),
			lookup: async (fp) => {
				const a = answers[fp.fingerprint];
				if (a instanceof Error) throw a;
				return a as never;
			},
		});
		expect(report).toMatchObject({
			sampled: 5,
			known: 1,
			fingerprintOnly: 1,
			unknown: 2,
			errors: 1,
			knownPercent: 25,
			byFormat: {
				flac: { sampled: 2, known: 1 },
				mp3: { sampled: 3, known: 0 },
			},
			scores: { "0.9+": 1, "0.7-0.9": 1, "<0.5": 1 },
		});
	});
});
