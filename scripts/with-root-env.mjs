import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

// Load root .env file
config({ path: path.resolve(root, ".env") });

// Map LYTERION_* prefixed keys to their canonical equivalents expected by third-party SDKs
if (
	!process.env.TRIGGER_SECRET_KEY &&
	process.env.LYTERION_TRIGGER_SECRET_KEY
) {
	process.env.TRIGGER_SECRET_KEY = process.env.LYTERION_TRIGGER_SECRET_KEY;
}
if (
	!process.env.TRIGGER_PROJECT_REF &&
	process.env.LYTERION_TRIGGER_PROJECT_REF
) {
	process.env.TRIGGER_PROJECT_REF = process.env.LYTERION_TRIGGER_PROJECT_REF;
}

if (!process.env.TRIGGER_API_URL && process.env.LYTERION_TRIGGER_API_URL) {
	process.env.TRIGGER_API_URL = process.env.LYTERION_TRIGGER_API_URL;
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) process.exit(1);

const child = spawn(cmd, args, {
	stdio: "inherit",
	shell: true,
	env: process.env,
});
child.on("error", (err) => {
	console.error(err);
	process.exit(1);
});
child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 1);
});
