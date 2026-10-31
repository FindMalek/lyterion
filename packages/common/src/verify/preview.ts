import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Same master gives a low bit error rate at the right offset, unrelated audio sits near 0.5. Tune on real pairs (#124).
export const PREVIEW_MAX_BER = 0.3;
// Fewer overlapping items than this (about 4 s) proves nothing.
const MIN_OVERLAP = 30;

export async function deezerPreviewUrl(
	isrc: string,
	doFetch: typeof fetch = fetch,
): Promise<string | null> {
	const res = await doFetch(
		`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`,
		{ signal: AbortSignal.timeout(10_000) },
	);
	if (!res.ok) return null;
	const data = (await res.json()) as { preview?: string; error?: unknown };
	return data.error || !data.preview ? null : data.preview;
}

export async function rawFingerprint(path: string): Promise<number[]> {
	const { stdout } = await run("fpcalc", ["-raw", "-length", "900", path], {
		maxBuffer: 64 * 1024 * 1024,
	});
	const line = stdout.split("\n").find((l) => l.startsWith("FINGERPRINT="));
	if (!line) return [];
	return line
		.slice("FINGERPRINT=".length)
		.split(",")
		.map((n) => Number(n) | 0);
}

function popcount(n: number): number {
	let v = n - ((n >>> 1) & 0x55555555);
	v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
	return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Slides the short fingerprint along the long one and returns the lowest bit error rate (0..1), or 1 when they barely overlap. */
export function bestBitErrorRate(preview: number[], full: number[]): number {
	if (preview.length < MIN_OVERLAP || full.length < MIN_OVERLAP) return 1;
	const [short, long] =
		preview.length <= full.length ? [preview, full] : [full, preview];
	let best = 1;
	for (let offset = 0; offset <= long.length - short.length; offset++) {
		let errors = 0;
		for (let i = 0; i < short.length; i++)
			errors += popcount((short[i] as number) ^ (long[offset + i] as number));
		best = Math.min(best, errors / (short.length * 32));
	}
	return best;
}

export function isPreviewMatch(preview: number[], full: number[]): boolean {
	return bestBitErrorRate(preview, full) <= PREVIEW_MAX_BER;
}
