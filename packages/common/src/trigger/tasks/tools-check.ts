import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";

const run = promisify(execFile);

// Every binary the pipeline shells out to, with the flag that prints its version.
const TOOLS: [string, string[]][] = [
	["ffmpeg", ["-version"]],
	["ffprobe", ["-version"]],
	["fpcalc", ["-version"]],
	["sox", ["--version"]],
	["python3", ["--version"]],
	[
		"python3",
		["-c", "import mutagen; print('mutagen', mutagen.version_string)"],
	],
	["yt-dlp", ["--version"]],
	["rsgain", ["--version"]],
	["rip", ["--version"]],
	["aria2c", ["--version"]],
];

// #5: the folders bound into runs by the patched supervisor must be writable, or acquire fails late.
async function writable(dir: string): Promise<string> {
	try {
		await mkdir(dir, { recursive: true });
		const probe = path.join(dir, `.lyterion-check-${randomUUID()}`);
		await writeFile(probe, "ok");
		await rm(probe);
		return "writable";
	} catch (err) {
		return `missing: ${err instanceof Error ? err.message : String(err)}`;
	}
}

export async function checkToolsAndMounts(): Promise<Record<string, string>> {
	const results: Record<string, string> = {};
	for (const [bin, args] of TOOLS) {
		const label = args[0] === "-c" ? "mutagen" : bin;
		try {
			const { stdout, stderr } = await run(bin, args);
			results[label] = (stdout || stderr).split("\n")[0]?.trim() ?? "";
		} catch (err) {
			results[label] =
				`missing: ${err instanceof Error ? err.message : String(err)}`;
		}
	}
	for (const dir of [
		path.join(env.LYTERION_MUSIC_DIR, env.LYTERION_LIBRARY_SUBDIR),
		env.LYTERION_STAGING_DIR,
		env.LYTERION_SLSKD_DOWNLOADS_DIR,
	])
		results[dir] = await writable(dir);
	return results;
}

/** #4 and #5 done-when: on the homelab worker, every tool prints its version and every mount is writable. */
export const toolsCheckTask = task({
	id: "tools.check",
	maxDuration: 120,
	run: async () => {
		const results = await checkToolsAndMounts();
		logger.info("tools and mounts", results);
		const missing = Object.entries(results).filter(([, v]) =>
			v.startsWith("missing"),
		);
		if (missing.length > 0)
			throw new Error(
				`missing tools or mounts: ${missing.map(([k]) => k).join(", ")}`,
			);
		return results;
	},
});
