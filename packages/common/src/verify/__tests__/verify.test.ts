import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Candidate } from "../../providers/types";
import { fingerprintVerdict, verifyFile } from "../index";

const hasFfmpeg = (() => {
	try {
		execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

const dir = mkdtempSync(join(tmpdir(), "lyterion-verify-"));

function ffmpeg(...args: string[]): void {
	execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
}

function noise(name: string, extra: string[] = []): string {
	const out = join(dir, name);
	ffmpeg(
		"-f",
		"lavfi",
		"-i",
		"anoisesrc=d=12:c=white:r=44100:a=0.3",
		"-ac",
		"2",
		...extra,
		out,
	);
	return out;
}

function transcoded(name: string, from: string, via: string[]): string {
	const lossy = join(dir, `${name}.mp3`);
	const out = join(dir, name);
	ffmpeg("-i", from, "-c:a", "libmp3lame", ...via, lossy);
	ffmpeg("-i", lossy, out);
	return out;
}

const flac: Candidate = {
	providerId: "slskd",
	ref: "x",
	format: "flac",
	isrcMatch: true,
	matchConfidence: 1,
};

describe.skipIf(!hasFfmpeg)("verifyFile", () => {
	it("passes a full band flac and flags mp3 128 and 320 transcodes as fake lossless", async () => {
		const real = noise("real.flac");
		const expectation = {
			durationMs: 12_000,
			mbRecordingIds: [],
			candidate: flac,
		};
		expect(await verifyFile(real, expectation)).toMatchObject({
			ok: true,
			verifiedLossless: true,
			upgradeReason: null,
		});
		for (const bitrate of ["128k", "320k"]) {
			const fake = transcoded(`fake-${bitrate}.flac`, real, ["-b:a", bitrate]);
			expect(await verifyFile(fake, expectation)).toMatchObject({
				ok: true,
				verifiedLossless: false,
				upgradeReason: "fake_lossless",
			});
		}
	});

	it("refuses YouTube files when no fingerprint lookup is configured (#38)", async () => {
		const result = await verifyFile(noise("yt.flac"), {
			durationMs: 12_000,
			mbRecordingIds: [],
			candidate: {
				...flac,
				providerId: "youtube",
				format: "opus",
				isrcMatch: false,
				matchConfidence: 0.95,
			},
		});
		expect(result).toMatchObject({ ok: false, reason: "no_fingerprint" });
	});

	it("rejects a file whose length is off by more than the tolerance", async () => {
		const result = await verifyFile(noise("short.flac"), {
			durationMs: 200_000,
			mbRecordingIds: [],
			candidate: flac,
		});
		expect(result).toMatchObject({ ok: false, reason: "duration" });
	});

	it("sees 16-bit audio padded into a 24-bit flac", async () => {
		const cd = noise("cd.wav", ["-c:a", "pcm_s16le"]);
		const padded = join(dir, "padded.flac");
		ffmpeg(
			"-i",
			cd,
			"-c:a",
			"flac",
			"-sample_fmt",
			"s32",
			"-bits_per_raw_sample",
			"24",
			padded,
		);
		const result = await verifyFile(padded, {
			durationMs: 12_000,
			mbRecordingIds: [],
			candidate: flac,
		});
		expect(result).toMatchObject({
			ok: true,
			facts: { bitDepth: 24 },
			effectiveBitDepth: 16,
		});
	});
});

describe("fingerprintVerdict", () => {
	it("matches on any confident expected recording, refuses others, abstains when unsure", () => {
		const results = [{ score: 0.92, recordingIds: ["live-take", "studio"] }];
		expect(fingerprintVerdict(results, ["studio"])).toBe("match");
		expect(fingerprintVerdict(results, ["other"])).toBe("mismatch");
		expect(
			fingerprintVerdict(
				[{ score: 0.3, recordingIds: ["studio"] }],
				["studio"],
			),
		).toBe("unknown");
		expect(fingerprintVerdict(results, [])).toBe("unknown");
	});
});
