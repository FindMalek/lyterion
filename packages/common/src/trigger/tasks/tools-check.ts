import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
];

/** #4 done-when: run on the homelab worker and every tool prints its version. */
export const toolsCheckTask = task({
	id: "tools.check",
	maxDuration: 120,
	run: async () => {
		const versions: Record<string, string> = {};
		for (const [bin, args] of TOOLS) {
			const label = args[0] === "-c" ? "mutagen" : bin;
			try {
				const { stdout, stderr } = await run(bin, args);
				versions[label] = (stdout || stderr).split("\n")[0]?.trim() ?? "";
			} catch (err) {
				versions[label] =
					`missing: ${err instanceof Error ? err.message : String(err)}`;
			}
		}
		logger.info("tools", versions);
		const missing = Object.entries(versions).filter(([, v]) =>
			v.startsWith("missing"),
		);
		if (missing.length > 0)
			throw new Error(`missing tools: ${missing.map(([k]) => k).join(", ")}`);
		return versions;
	},
});
