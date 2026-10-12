import { readdir } from "node:fs/promises";
import path from "node:path";

import type { AcoustidResult } from "./acoustid";
import type { Fingerprint } from "./audio";

const AUDIO = new Set([".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav"]);
// The same score the verifier trusts (acoustid.ts), so the spike measures what verification will see.
const MIN_SCORE = 0.5;

export type CoverageReport = {
	sampled: number;
	known: number;
	// AcoustID has the fingerprint but no MusicBrainz recording on it: still "unknown" to the verifier.
	fingerprintOnly: number;
	unknown: number;
	errors: number;
	knownPercent: number;
	byFormat: Record<string, { sampled: number; known: number }>;
	scores: Record<string, number>;
};

export async function audioFiles(dir: string): Promise<string[]> {
	const out: string[] = [];
	async function walk(current: string) {
		let entries: import("node:fs").Dirent[];
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) await walk(full);
			else if (AUDIO.has(path.extname(entry.name).toLowerCase()))
				out.push(full);
		}
	}
	await walk(dir);
	return out;
}

export function sample<T>(items: T[], size: number, random = Math.random): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
	}
	return copy.slice(0, size);
}

function bucket(score: number): string {
	if (score >= 0.9) return "0.9+";
	if (score >= 0.7) return "0.7-0.9";
	if (score >= MIN_SCORE) return "0.5-0.7";
	return "<0.5";
}

/** S7 (#21): how much of a real library AcoustID can confirm, which sets the verification thresholds. */
export async function measureCoverage(
	files: string[],
	deps: {
		fingerprint: (file: string) => Promise<Fingerprint>;
		lookup: (fp: Fingerprint) => Promise<AcoustidResult[]>;
	},
): Promise<CoverageReport> {
	const report: CoverageReport = {
		sampled: files.length,
		known: 0,
		fingerprintOnly: 0,
		unknown: 0,
		errors: 0,
		knownPercent: 0,
		byFormat: {},
		scores: {},
	};
	for (const file of files) {
		const format = path.extname(file).slice(1).toLowerCase();
		const slot = report.byFormat[format] ?? { sampled: 0, known: 0 };
		report.byFormat[format] = slot;
		slot.sampled++;
		try {
			const results = await deps.lookup(await deps.fingerprint(file));
			const best = Math.max(0, ...results.map((r) => r.score));
			const confident = results.some(
				(r) => r.score >= MIN_SCORE && r.recordingIds.length > 0,
			);
			if (results.length > 0)
				report.scores[bucket(best)] = (report.scores[bucket(best)] ?? 0) + 1;
			if (confident) {
				report.known++;
				slot.known++;
			} else if (results.some((r) => r.score >= MIN_SCORE))
				report.fingerprintOnly++;
			else report.unknown++;
		} catch {
			report.errors++;
		}
	}
	const measured = report.sampled - report.errors;
	report.knownPercent =
		measured > 0 ? Math.round((report.known / measured) * 1000) / 10 : 0;
	return report;
}
