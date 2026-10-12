import {
	additionalFiles,
	aptGet,
	ffmpeg,
} from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
	// process.env, not apiEnv: apiEnv validates the whole api schema eagerly, which `trigger deploy` doesn't have.
	project:
		process.env.LYTERION_TRIGGER_PROJECT_REF ??
		process.env.TRIGGER_PROJECT_REF ??
		"",
	runtime: "node-24",
	dirs: ["./src/trigger"],
	maxDuration: 1800,
	// Verification and tagging shell out to ffmpeg/ffprobe, fpcalc (AcoustID) and mutagen (D-005, D-007).
	build: {
		extensions: [
			ffmpeg(),
			aptGet({
				packages: ["libchromaprint-tools", "python3", "python3-mutagen"],
			}),
			additionalFiles({
				files: ["../../packages/common/python/write_tags.py"],
			}),
		],
	},
	retries: {
		enabledInDev: false,
		default: {
			maxAttempts: 1,
		},
	},
});
