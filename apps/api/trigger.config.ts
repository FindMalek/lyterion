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
	retries: {
		enabledInDev: false,
		default: {
			maxAttempts: 1,
		},
	},
});
