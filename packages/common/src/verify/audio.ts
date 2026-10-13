import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;
const FFT_SIZE = 8192;

export type AudioFacts = {
	codec: string;
	sampleRateHz: number;
	bitDepth: number | null;
	channels: number;
	durationMs: number;
	bitrateKbps: number | null;
};

type FfprobeStream = {
	codec_type?: string;
	codec_name?: string;
	sample_rate?: string;
	bits_per_raw_sample?: string;
	bits_per_sample?: number;
	channels?: number;
	duration?: string;
	bit_rate?: string;
};

export async function probe(path: string): Promise<AudioFacts> {
	const { stdout } = await run(
		"ffprobe",
		["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
		{
			maxBuffer: MAX_BUFFER,
		},
	);
	const data = JSON.parse(stdout) as {
		streams?: FfprobeStream[];
		format?: { duration?: string; bit_rate?: string };
	};
	const stream = data.streams?.find((s) => s.codec_type === "audio");
	if (!stream?.codec_name) throw new Error(`no audio stream in ${path}`);
	const bitDepth =
		Number(stream.bits_per_raw_sample) || stream.bits_per_sample || null;
	const bitrate = Number(stream.bit_rate ?? data.format?.bit_rate);
	return {
		codec: stream.codec_name,
		sampleRateHz: Number(stream.sample_rate),
		bitDepth,
		channels: stream.channels ?? 2,
		durationMs: Math.round(
			Number(stream.duration ?? data.format?.duration) * 1000,
		),
		bitrateKbps:
			Number.isFinite(bitrate) && bitrate > 0
				? Math.round(bitrate / 1000)
				: null,
	};
}

// Soulseek files often carry a junk trailing tag or one bad frame that ffmpeg reports and plays straight past.
export const MAX_DECODE_ERRORS = 5;

/** A full decode that exits cleanly with at most a few frame errors; more than that is audible damage. */
export function decodeIsClean(stderr: string): boolean {
	const errors = stderr.split("\n").filter((line) => line.trim() !== "");
	return errors.length <= MAX_DECODE_ERRORS;
}

export async function decodesCleanly(path: string): Promise<boolean> {
	try {
		const { stderr } = await run(
			"ffmpeg",
			["-v", "error", "-i", path, "-f", "null", "-"],
			{
				maxBuffer: MAX_BUFFER,
			},
		);
		return decodeIsClean(stderr);
	} catch {
		return false;
	}
}

async function decodeWindow(
	path: string,
	startSec: number,
	seconds: number,
	format: "f32le" | "s32le",
) {
	const args = [
		"-v",
		"error",
		"-ss",
		String(startSec),
		"-t",
		String(seconds),
		"-i",
		path,
	];
	if (format === "f32le") args.push("-ac", "1");
	args.push("-f", format, "-");
	const { stdout } = await run("ffmpeg", args, {
		encoding: "buffer",
		maxBuffer: MAX_BUFFER,
	});
	return stdout;
}

function fftMagnitudes(samples: Float32Array, offset: number): Float64Array {
	const re = new Float64Array(FFT_SIZE);
	const im = new Float64Array(FFT_SIZE);
	for (let i = 0; i < FFT_SIZE; i++) {
		const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
		re[i] = (samples[offset + i] ?? 0) * hann;
	}
	for (let i = 1, j = 0; i < FFT_SIZE; i++) {
		let bit = FFT_SIZE >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
			[im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
		}
	}
	for (let len = 2; len <= FFT_SIZE; len <<= 1) {
		const angle = (-2 * Math.PI) / len;
		for (let i = 0; i < FFT_SIZE; i += len) {
			for (let k = 0; k < len / 2; k++) {
				const wr = Math.cos(angle * k);
				const wi = Math.sin(angle * k);
				const a = i + k;
				const b = a + len / 2;
				const tr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
				const ti = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
				re[b] = (re[a] ?? 0) - tr;
				im[b] = (im[a] ?? 0) - ti;
				re[a] = (re[a] ?? 0) + tr;
				im[a] = (im[a] ?? 0) + ti;
			}
		}
	}
	const mags = new Float64Array(FFT_SIZE / 2);
	for (let i = 0; i < mags.length; i++)
		mags[i] = Math.hypot(re[i] ?? 0, im[i] ?? 0);
	return mags;
}

// Highest frequency still carrying content, averaged over 3 windows (docs/verification.md § Spectral).
export async function spectralCutoffHz(
	path: string,
	facts: AudioFacts,
): Promise<number> {
	const durationSec = facts.durationMs / 1000;
	const power = new Float64Array(FFT_SIZE / 2);
	let frames = 0;
	for (const at of [0.2, 0.5, 0.8]) {
		const buffer = await decodeWindow(
			path,
			Math.max(0, durationSec * at - 1),
			2,
			"f32le",
		);
		const samples = new Float32Array(
			buffer.buffer,
			buffer.byteOffset,
			Math.floor(buffer.byteLength / 4),
		);
		for (
			let offset = 0;
			offset + FFT_SIZE <= samples.length;
			offset += FFT_SIZE
		) {
			const mags = fftMagnitudes(samples, offset);
			for (let i = 0; i < mags.length; i++)
				power[i] = (power[i] ?? 0) + (mags[i] ?? 0) ** 2;
			frames++;
		}
	}
	if (frames === 0) return 0;
	const binHz = facts.sampleRateHz / FFT_SIZE;
	const db = Array.from(power, (p) => 10 * Math.log10(p / frames + 1e-20));
	const reference = db.slice(
		Math.round(1000 / binHz),
		Math.round(10000 / binHz),
	);
	const level =
		reference.reduce((sum, v) => sum + v, 0) / Math.max(1, reference.length);
	for (let i = db.length - 1; i > 0; i--) {
		if ((db[i] ?? Number.NEGATIVE_INFINITY) > level - 50)
			return Math.round(i * binHz);
	}
	return 0;
}

// A "24-bit" file whose low 8 bits are always zero is 16-bit audio padded out.
export async function isPadded24Bit(
	path: string,
	facts: AudioFacts,
): Promise<boolean> {
	if (facts.bitDepth !== 24) return false;
	const buffer = await decodeWindow(
		path,
		Math.max(0, facts.durationMs / 2000 - 5),
		10,
		"s32le",
	);
	const samples = new Int32Array(
		buffer.buffer,
		buffer.byteOffset,
		Math.floor(buffer.byteLength / 4),
	);
	return samples.length > 0 && samples.every((s) => (s & 0xffff) === 0);
}

export type Fingerprint = { fingerprint: string; durationSec: number };

export async function fingerprint(path: string): Promise<Fingerprint> {
	// Without -ignore-errors one bad frame fails the whole fingerprint, after decodesCleanly already accepted it.
	const { stdout } = await run("fpcalc", ["-json", "-ignore-errors", path], {
		maxBuffer: MAX_BUFFER,
	});
	const data = JSON.parse(stdout) as { fingerprint: string; duration: number };
	return {
		fingerprint: data.fingerprint,
		durationSec: Math.round(data.duration),
	};
}
