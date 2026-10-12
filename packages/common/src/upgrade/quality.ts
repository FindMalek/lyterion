// Upgrade acceptance (D-023): a strictly better quality class, or a fingerprint-verified match.
const LOSSLESS_CODECS = /^(flac|alac|pcm_)/;
const TRANSPARENT_KBPS: Record<string, number> = {
	mp3: 240,
	aac: 256,
	opus: 160,
	vorbis: 160,
};

export type FileQuality = {
	codec: string;
	bitrateKbps: number | null;
	verifiedLossless: boolean;
	upgradeReason: string | null;
};

/** 3 verified lossless, 2 transparent lossy, 1 below transparent (a fake FLAC or fake 320 counts as 1). */
export function qualityRank(file: FileQuality): 1 | 2 | 3 {
	if (
		file.upgradeReason === "fake_lossless" ||
		file.upgradeReason === "fake_bitrate"
	)
		return 1;
	if (LOSSLESS_CODECS.test(file.codec)) return file.verifiedLossless ? 3 : 1;
	const line = TRANSPARENT_KBPS[file.codec];
	return line !== undefined && (file.bitrateKbps ?? 0) >= line ? 2 : 1;
}

const MATCH_REASONS = new Set([
	"unverified_match",
	"youtube_source",
	"owner_flag",
]);

export function isUpgrade(
	current: FileQuality,
	next: FileQuality & { fingerprintVerdict: "match" | "mismatch" | "unknown" },
): boolean {
	const from = qualityRank(current);
	const to = qualityRank(next);
	if (to > from) return true;
	// Same class only helps when the doubt was about the match itself and the new file proves it.
	return (
		to === from &&
		next.fingerprintVerdict === "match" &&
		MATCH_REASONS.has(current.upgradeReason ?? "")
	);
}

export function describeQuality(
	file: FileQuality & {
		bitDepth?: number | null;
		sampleRateHz?: number | null;
	},
): string {
	if (LOSSLESS_CODECS.test(file.codec)) {
		const khz = file.sampleRateHz
			? `/${Math.round(file.sampleRateHz / 100) / 10}`
			: "";
		return `FLAC ${file.bitDepth ?? 16}${khz}`;
	}
	return `${file.codec.toUpperCase()} ${file.bitrateKbps ?? "?"}`;
}
