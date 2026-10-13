import { readFile } from "node:fs/promises";
import type { BuildExtension } from "@trigger.dev/build/extensions";
import {
	additionalFiles,
	aptGet,
	ffmpeg,
	syncEnvVars,
} from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

// Debian's yt-dlp is too old for YouTube, so the pinned standalone release goes in the image (#4).
const YT_DLP_VERSION = "2026.08.19";

function ytDlp(): BuildExtension {
	return {
		name: "yt-dlp",
		onBuildComplete(context) {
			if (context.target === "dev") return;
			context.addLayer({
				id: "yt-dlp",
				image: {
					instructions: [
						`ADD https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp /usr/local/bin/yt-dlp`,
						"RUN chmod 755 /usr/local/bin/yt-dlp",
					],
				},
			});
		},
	};
}

// Upstream's rsgain .deb targets trixie, so its static Linux build; streamrip in its own venv, off the system Python (#4).
const RSGAIN_VERSION = "3.8";
const STREAMRIP_VERSION = "2.1.0";

function rsgainAndStreamrip(): BuildExtension {
	return {
		name: "rsgain-streamrip",
		onBuildComplete(context) {
			if (context.target === "dev") return;
			context.addLayer({
				id: "rsgain-streamrip",
				image: {
					instructions: [
						`ADD https://github.com/complexlogic/rsgain/releases/download/v${RSGAIN_VERSION}/rsgain-${RSGAIN_VERSION}-Linux.tar.xz /tmp/rsgain.tar.xz`,
						"RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv xz-utils && rm -rf /var/lib/apt/lists/*",
						"RUN mkdir -p /opt/rsgain && tar -xJf /tmp/rsgain.tar.xz -C /opt/rsgain --strip-components=1 && ln -s /opt/rsgain/rsgain /usr/local/bin/rsgain && rm /tmp/rsgain.tar.xz",
						`RUN python3 -m venv /opt/streamrip && /opt/streamrip/bin/pip install --no-cache-dir --only-binary=:all: streamrip==${STREAMRIP_VERSION} && ln -s /opt/streamrip/bin/rip /usr/local/bin/rip`,
					],
				},
			});
		},
	};
}

// The deploy indexer imports every task file in the image build, with no app env; build.env never reaches runs.
function skipEnvValidationAtIndex(): BuildExtension {
	return {
		name: "skip-env-validation-at-index",
		onBuildComplete(context) {
			if (context.target === "dev") return;
			context.addLayer({
				id: "skip-env-validation-at-index",
				build: { env: { SKIP_ENV_VALIDATION: "true" } },
			});
		},
	};
}

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
				packages: [
					"aria2",
					"libchromaprint-tools",
					"python3",
					"python3-mutagen",
					"sox",
				],
			}),
			ytDlp(),
			rsgainAndStreamrip(),
			skipEnvValidationAtIndex(),
			// The api app's env, written by the production deploy step, so runs share its database and secrets.
			syncEnvVars(
				async () => {
					const file = process.env.TRIGGER_ENV_FILE;
					if (!file) return;
					return JSON.parse(await readFile(file, "utf8")) as Record<
						string,
						string
					>;
				},
				{ override: true },
			),
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
