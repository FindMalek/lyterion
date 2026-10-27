import { execFile, spawn } from "node:child_process";
import { access, copyFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { AudioFacts } from "../verify/audio";
import { moveFile } from "./move";
import type { TagMap } from "./tags";

const run = promisify(execFile);
const EMBEDDED_COVER_MAX_PX = 1200;
// Next to the source in dev; in the bundled Trigger image additionalFiles puts it under the build root.
const WRITE_TAGS_CANDIDATES = [
	process.env.LYTERION_WRITE_TAGS_SCRIPT,
	fileURLToPath(new URL("../../python/write_tags.py", import.meta.url)),
	join(process.cwd(), "packages/common/python/write_tags.py"),
	join(process.cwd(), "python/write_tags.py"),
	join(process.cwd(), "write_tags.py"),
].filter((p): p is string => !!p);

let writeTagsScript: string | undefined;
async function resolveWriteTagsScript(): Promise<string> {
	if (writeTagsScript) return writeTagsScript;
	for (const candidate of WRITE_TAGS_CANDIDATES)
		if (await exists(candidate)) {
			writeTagsScript = candidate;
			return candidate;
		}
	throw new Error(
		`write_tags.py not found (looked in ${WRITE_TAGS_CANDIDATES.join(", ")})`,
	);
}

export type PlaceOptions = {
	musicDir: string;
	librarySubdir: string;
	python?: string;
	maxBitDepth?: number;
	maxSampleRateHz?: number;
};

export function resolveLibraryPath(
	options: PlaceOptions,
	relativePath: string,
): string {
	const root = resolve(options.musicDir, options.librarySubdir);
	const target = resolve(root, relativePath);
	if (!target.startsWith(root + sep)) {
		throw new Error(`refusing to write outside ${root}: ${relativePath}`);
	}
	return target;
}

// Lossless above the cap gets resampled to FLAC 16/44.1 in place (D-017).
const LOSSLESS_CODECS = new Set(["flac", "alac", "wav"]);

export function isLosslessCodec(codec: string): boolean {
	return LOSSLESS_CODECS.has(codec) || codec.startsWith("pcm_");
}

export async function downsampleToCap(
	path: string,
	facts: AudioFacts,
	options: PlaceOptions,
): Promise<boolean> {
	const maxDepth = options.maxBitDepth ?? 16;
	const maxRate = options.maxSampleRateHz ?? 44_100;
	// Only lossless gets capped (D-017): opus is always 48 kHz and must stay opus.
	if (!isLosslessCodec(facts.codec)) return false;
	if ((facts.bitDepth ?? 0) <= maxDepth && facts.sampleRateHz <= maxRate)
		return false;
	const out = `${path}.cap.flac`;
	await run("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-i",
		path,
		"-map",
		"0:a",
		"-c:a",
		"flac",
		"-sample_fmt",
		maxDepth <= 16 ? "s16" : "s32",
		"-ar",
		String(Math.min(facts.sampleRateHz, maxRate)),
		out,
	]);
	await rename(out, path);
	return true;
}

export async function prepareEmbeddedCover(
	coverPath: string,
	outPath: string,
): Promise<string> {
	await run("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-i",
		coverPath,
		"-vf",
		`scale='min(${EMBEDDED_COVER_MAX_PX},iw)':-2`,
		"-q:v",
		"3",
		outPath,
	]);
	return outPath;
}

export function writeTags(
	path: string,
	tags: TagMap,
	cover: string | null,
	python = "python3",
	merge = false,
): Promise<void> {
	return resolveWriteTagsScript().then(
		(script) =>
			new Promise<void>((resolvePromise, reject) => {
				const child = spawn(python, [script], {
					stdio: ["pipe", "pipe", "pipe"],
				});
				let stderr = "";
				child.stderr.on("data", (chunk) => {
					stderr += chunk;
				});
				child.on("error", reject);
				child.on("close", (code) => {
					if (code === 0) resolvePromise();
					else
						reject(new Error(`write_tags failed (${code}): ${stderr.trim()}`));
				});
				child.stdin.end(JSON.stringify({ path, tags, cover, merge }));
			}),
	);
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

export type PlaceInput = {
	stagedPath: string;
	relativePath: string;
	tags: TagMap;
	coverPath: string | null;
};

// Staging and the library are separate mounts in a run, so moveFile copies beside the target and renames: Navidrome never sees half a file.
export async function placeFile(
	input: PlaceInput,
	options: PlaceOptions,
): Promise<string> {
	const target = resolveLibraryPath(options, input.relativePath);
	const embedded = input.coverPath
		? await prepareEmbeddedCover(
				input.coverPath,
				`${input.stagedPath}.cover.jpg`,
			)
		: null;
	try {
		await writeTags(input.stagedPath, input.tags, embedded, options.python);
	} finally {
		if (embedded) await rm(embedded, { force: true });
	}
	const folder = dirname(target);
	await mkdir(folder, { recursive: true });
	await moveFile(input.stagedPath, target);
	const folderCover = join(folder, "cover.jpg");
	if (input.coverPath && !(await exists(folderCover))) {
		const tmp = `${folderCover}.tmp`;
		await copyFile(input.coverPath, tmp);
		await rename(tmp, folderCover);
	}
	return target;
}
