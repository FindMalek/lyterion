import { describe, expect, it } from "vitest";

import { upgradeQueueNsp } from "../nsp";
import { describeQuality, isUpgrade, qualityRank } from "../quality";

const flac = {
	codec: "flac",
	bitrateKbps: null,
	verifiedLossless: true,
	upgradeReason: null,
};
const mp3 = (kbps: number, reason: string | null = null) => ({
	codec: "mp3",
	bitrateKbps: kbps,
	verifiedLossless: false,
	upgradeReason: reason,
});

describe("qualityRank", () => {
	it("classes by real quality, fakes included", () => {
		expect(qualityRank(flac)).toBe(3);
		expect(
			qualityRank({
				...flac,
				verifiedLossless: false,
				upgradeReason: "fake_lossless",
			}),
		).toBe(1);
		expect(qualityRank(mp3(320))).toBe(2);
		expect(qualityRank(mp3(320, "fake_bitrate"))).toBe(1);
		expect(qualityRank(mp3(192))).toBe(1);
		expect(
			qualityRank({
				codec: "opus",
				bitrateKbps: 75,
				verifiedLossless: false,
				upgradeReason: null,
			}),
		).toBe(1);
		expect(
			qualityRank({
				codec: "vorbis",
				bitrateKbps: 160,
				verifiedLossless: false,
				upgradeReason: null,
			}),
		).toBe(2);
	});
});

describe("isUpgrade", () => {
	it("accepts a better class, refuses the same class unless the match gets proven", () => {
		expect(
			isUpgrade(mp3(128, "below_transparent"), {
				...flac,
				fingerprintVerdict: "unknown",
			}),
		).toBe(true);
		expect(
			isUpgrade(mp3(320), { ...mp3(320), fingerprintVerdict: "unknown" }),
		).toBe(false);
		expect(
			isUpgrade(mp3(320, "owner_flag"), {
				...mp3(256),
				fingerprintVerdict: "match",
			}),
		).toBe(true);
		expect(
			isUpgrade(mp3(320, "owner_flag"), {
				...mp3(256),
				fingerprintVerdict: "unknown",
			}),
		).toBe(false);
		expect(isUpgrade(flac, { ...mp3(320), fingerprintVerdict: "match" })).toBe(
			false,
		);
	});
});

describe("describeQuality and nsp", () => {
	it("formats the ntfy labels and writes a rating rule", () => {
		expect(
			describeQuality({ ...flac, bitDepth: 16, sampleRateHz: 44_100 }),
		).toBe("FLAC 16/44.1");
		expect(describeQuality(mp3(128))).toBe("MP3 128");
		expect(JSON.parse(upgradeQueueNsp())).toMatchObject({
			name: "Upgrade queue",
			all: [{ is: { rating: 1 } }],
		});
	});
});
