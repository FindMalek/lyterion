import { rm } from "node:fs/promises";

import { env } from "@lyterion/env/server";
import { logger, schedules, task } from "@trigger.dev/sdk";

import { acquireRecording } from "../../acquire/acquire";
import { diskGuard } from "../../acquire/disk";
import { groqPickAsk } from "../../acquire/llm";
import { createPlacer, loadAcquireJob } from "../../acquire/persist";
import { configuredProviders } from "../../credentials/providers";
import { getCredentials } from "../../credentials/store";
import { albumGainAfterPlace } from "../../library/album-gain";
import { createNavidromeClient } from "../../navidrome/client";
import { createNotifier } from "../../notify/ntfy";
import type { Provider } from "../../providers/types";
import { UPGRADE_PLAYLIST_NAME } from "../../upgrade/nsp";
import {
	filesToUpgrade,
	markNoBetterNotified,
	swapFile,
} from "../../upgrade/persist";
import { describeQuality, isUpgrade } from "../../upgrade/quality";
import { createAcoustidClient } from "../../verify/acoustid";
import { verifyFile } from "../../verify/index";
import { requestScan } from "./navidrome-scan";

const UPGRADE_PRIORITY: Record<string, number> = {
	below_transparent: 3,
	fake_lossless: 3,
	fake_bitrate: 3,
	unverified_match: 2,
	youtube_source: 1,
};

// The current source is excluded so the same file can't come back as its own upgrade.
function excluding(providers: Provider[], ref: string | null): Provider[] {
	return providers.map((p) => ({
		...p,
		search: async (target) =>
			(await p.search(target)).filter((c) => c.ref !== ref),
	}));
}

export async function runUpgrade(fileIds?: number[]) {
	const [rows, providers, acoustid, groq, navidrome, ntfy] = await Promise.all([
		filesToUpgrade(fileIds),
		configuredProviders(),
		getCredentials("acoustid"),
		getCredentials("groq"),
		getCredentials("navidrome"),
		getCredentials("ntfy"),
	]);
	const lookup = acoustid ? createAcoustidClient(acoustid.apiKey) : null;
	const notifier = createNotifier(
		ntfy
			? { url: ntfy.url, topic: ntfy.topic, token: ntfy.token || undefined }
			: null,
	);
	const client = navidrome ? createNavidromeClient(navidrome) : null;
	const placeOptions = {
		musicDir: env.LYTERION_MUSIC_DIR,
		librarySubdir: env.LYTERION_LIBRARY_SUBDIR,
		python: env.LYTERION_PYTHON,
		maxBitDepth: env.LYTERION_MAX_BIT_DEPTH,
		maxSampleRateHz: env.LYTERION_MAX_SAMPLE_RATE_HZ,
	};
	let upgraded = 0;

	for (const { file, title, artists } of rows) {
		if (!file.recordingId) continue;
		const job = await loadAcquireJob(file.recordingId);
		if (!job) continue;
		const from = describeQuality(file);
		const outcome = await acquireRecording(job.target, {
			providers: excluding(providers, file.sourceRef),
			stagingDir: env.LYTERION_STAGING_DIR,
			guard: () =>
				diskGuard({
					musicDir: env.LYTERION_MUSIC_DIR,
					stagingDir: env.LYTERION_STAGING_DIR,
					stagingBudgetGb: env.LYTERION_STAGING_BUDGET_GB,
					minFreeGb: env.LYTERION_MIN_FREE_GB,
				}),
			verify: (path, candidate) =>
				verifyFile(
					path,
					{ durationMs: job.target.durationMs, mbRecordingIds: [], candidate },
					lookup ? { lookupFingerprint: (fp) => lookup.lookup(fp) } : {},
				),
			pick: groq ? groqPickAsk(groq.apiKey) : undefined,
			place: async (staged, candidate, verify) => {
				const next = {
					codec: verify.facts.codec,
					bitrateKbps: verify.facts.bitrateKbps,
					verifiedLossless: verify.verifiedLossless,
					upgradeReason: verify.upgradeReason,
					fingerprintVerdict: verify.verdict,
				};
				if (!isUpgrade(file, next))
					throw new Error("not better than the current file");
				const path = await createPlacer(job, placeOptions)(
					staged,
					candidate,
					verify,
				);
				// Same path: placeFile already replaced it atomically. A new extension leaves the old one behind.
				if (path !== file.path) await rm(file.path, { force: true });
				return path;
			},
		});

		if (outcome.status === "paused") {
			logger.warn("upgrade paused", { reason: outcome.reason });
			break;
		}
		if (outcome.status === "placed") {
			const { facts } = outcome.verify;
			await swapFile(file.id, {
				path: outcome.path,
				codec: facts.codec,
				bitrateKbps: facts.bitrateKbps,
				bitDepth: outcome.verify.effectiveBitDepth ?? facts.bitDepth,
				sampleRateHz: facts.sampleRateHz,
				durationMs: facts.durationMs,
				spectralCutoffHz: Math.round(outcome.verify.cutoffHz),
				verifiedLossless: outcome.verify.verifiedLossless,
				sourceProvider: outcome.chosen.providerId,
				sourceRef: outcome.chosen.ref,
				upgradeReason: outcome.verify.upgradeReason,
				upgradePriority: outcome.verify.upgradeReason
					? (UPGRADE_PRIORITY[outcome.verify.upgradeReason] ?? 1)
					: null,
				pathChanged: outcome.path !== file.path,
			});
			if (client && file.navidromeSongId)
				await clearSignal(client, file.navidromeSongId, file.upgradeSignal);
			await albumGainAfterPlace(file.releaseId, env.LYTERION_PYTHON);
			await requestScan();
			await notifier.notify({
				kind: "upgrade",
				artist: artists[0] ?? "",
				title,
				from,
				to: describeQuality({
					...facts,
					verifiedLossless: outcome.verify.verifiedLossless,
					upgradeReason: outcome.verify.upgradeReason,
					bitDepth: outcome.verify.effectiveBitDepth ?? facts.bitDepth,
				}),
			});
			upgraded++;
		} else if (file.upgradeSignal && !file.upgradeNotifiedAt) {
			// D-026: say it once when an owner-flagged file has no better source yet; it stays queued.
			await notifier.notify({
				kind: "upgrade",
				artist: artists[0] ?? "",
				title,
				from,
				to: null,
			});
			await markNoBetterNotified(file.id);
		}
	}
	logger.info("quality upgrade done", { checked: rows.length, upgraded });
	return { checked: rows.length, upgraded };
}

async function clearSignal(
	client: ReturnType<typeof createNavidromeClient>,
	songId: string,
	signal: "rating" | "playlist" | null,
) {
	if (signal === "rating") await client.setRating(songId, 0);
	if (signal === "playlist") {
		const playlist = (await client.playlists()).find(
			(p) => p.name === UPGRADE_PLAYLIST_NAME,
		);
		if (!playlist) return;
		const songs = await client.playlistSongs(playlist.id);
		const indexes = songs.flatMap((id, i) => (id === songId ? [i] : []));
		if (indexes.length > 0)
			await client.removeFromPlaylist(playlist.id, indexes);
	}
}

export const qualityUpgradeTask = task({
	id: "quality.upgrade",
	queue: { name: "acquire", concurrencyLimit: 2 },
	maxDuration: 6 * 3600,
	run: (payload: { fileIds?: number[] }) => runUpgrade(payload.fileIds),
});

// Weekly sweep of every flagged file (D-023), Monday 04:00 UTC.
export const qualityUpgradeWeekly = schedules.task({
	id: "quality.upgrade.weekly",
	cron: "0 4 * * 1",
	maxDuration: 6 * 3600,
	run: () => runUpgrade(),
});
