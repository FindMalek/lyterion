import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
config({ path: path.resolve(root, ".env") });

const env = { ...process.env };
if (!env.TRIGGER_SECRET_KEY && env.LYTERION_TRIGGER_SECRET_KEY) {
	env.TRIGGER_SECRET_KEY = env.LYTERION_TRIGGER_SECRET_KEY;
}
if (!env.TRIGGER_PROJECT_REF && env.LYTERION_TRIGGER_PROJECT_REF) {
	env.TRIGGER_PROJECT_REF = env.LYTERION_TRIGGER_PROJECT_REF;
}

// Self-hosted instance on the-keep, the CLI reads TRIGGER_API_URL.
if (!env.TRIGGER_API_URL && env.LYTERION_TRIGGER_API_URL) {
	env.TRIGGER_API_URL = env.LYTERION_TRIGGER_API_URL;
}

const projectRef = (env.TRIGGER_PROJECT_REF ?? "").trim();
if (!projectRef) {
	if (env.LYTERION_TRIGGER_DEV_SKIP === "true") {
		console.warn(
			"Skipping Trigger.dev worker (LYTERION_TRIGGER_DEV_SKIP=true). Background jobs will not run locally.",
		);
		process.exit(0);
	}
	console.error(
		"Missing Trigger project ref: set LYTERION_TRIGGER_PROJECT_REF (or TRIGGER_PROJECT_REF) in .env to your Trigger.dev project slug.",
	);
	console.error(
		"Or set LYTERION_TRIGGER_DEV_SKIP=true to run dev without the Trigger worker.",
	);
	process.exit(1);
}

const child = spawn(
	"npx",
	["trigger.dev@latest", "dev", "--config", "apps/api/trigger.config.ts"],
	{ stdio: "inherit", shell: true, env, cwd: root },
);

child.on("exit", (code) => {
	process.exit(code ?? 1);
});
