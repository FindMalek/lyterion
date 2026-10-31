import { rm, stat } from "node:fs/promises";
import path from "node:path";

import { db } from "@lyterion/db";
import { libraryFile } from "@lyterion/db/schema/library";
import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { createPlacer, loadAcquireJob } from "../../acquire/persist";
import { configuredProviders } from "../../credentials/providers";
import type { AudioFormat, Candidate, ProviderId } from "../../providers/types";
import { probe } from "../../verify/audio";
import { verifyFile } from "../../verify/index";
import { requestScan } from "./navidrome-scan";

const LOSSY_EXTENSION = String.raw`\.(opus|m4a|mp3|ogg)$`;
const PARALLEL = 3;
const FORMAT_BY_EXT: Record<string, AudioFormat> = {
	opus: "opus",
	m4a: "aac",
	mp3: "mp3",
	ogg: "vorbis",
};

export type RepairPayload = { limit?: number; dryRun?: boolean };

// Lossy downloads that the old cap re-encoded to FLAC (#174): fetch the original again from the same source.
export const libraryRepairTranscodesTask = task({
	id: "library.repair-transcodes",
	queue: { name: "library-repair", concurrencyLimit: 1 },
	maxDuration: 6 * 3600,
	run: async ({ limit, dryRun = false }: RepairPayload = {}) => {
		const rows = await db
			.select({
				id: libraryFile.id,
				path: libraryFile.path,
				recordingId: libraryFile.recordingId,
				sourceProvider: libraryFile.sourceProvider,
				sourceRef: libraryFile.sourceRef,
			})
			.from(libraryFile)
			.where(
				and(
					eq(libraryFile.owned, true),
					isNotNull(libraryFile.sourceRef),
					isNotNull(libraryFile.recordingId),
					sql`${libraryFile.path} ~ ${LOSSY_EXTENSION}`,
				),
			);

		const affected: typeof rows = [];
		for (const row of rows) {
			const codec = await probe(row.path)
				.then((f) => f.codec)
				.catch(() => null);
			if (codec === "flac") affected.push(row);
		}
		const todo = limit ? affected.slice(0, limit) : affected;
		logger.info("repair scan", {
			lossyNamed: rows.length,
			transcoded: affected.length,
			todo: todo.length,
		});
		if (dryRun) return { lossyNamed: rows.length, transcoded: affected.length };

		const providers = await configuredProviders();
		const placeOptions = {
			musicDir: env.LYTERION_MUSIC_DIR,
			librarySubdir: env.LYTERION_LIBRARY_SUBDIR,
			python: env.LYTERION_PYTHON,
			maxBitDepth: env.LYTERION_MAX_BIT_DEPTH,
			maxSampleRateHz: env.LYTERION_MAX_SAMPLE_RATE_HZ,
		};
		const result = {
			repaired: 0,
			failed: 0,
			savedBytes: 0,
			errors: [] as string[],
		};

		async function repair(row: (typeof todo)[number]) {
			const provider = providers.find((p) => p.id === row.sourceProvider);
			const job = row.recordingId
				? await loadAcquireJob(row.recordingId)
				: null;
			if (!provider || !job || !row.sourceRef)
				throw new Error(`${row.sourceProvider ?? "no provider"} unavailable`);
			const ext = path.extname(row.path).slice(1).toLowerCase();
			const candidate: Candidate = {
				providerId: row.sourceProvider as ProviderId,
				ref: row.sourceRef,
				format: FORMAT_BY_EXT[ext] ?? "opus",
				isrcMatch: false,
				matchConfidence: 1,
			};
			const before = (await stat(row.path)).size;
			const fetched = await provider.fetch(candidate, env.LYTERION_STAGING_DIR);
			const verify = await verifyFile(fetched.path, {
				durationMs: job.target.durationMs,
				mbRecordingIds: [],
				candidate,
				ownerPick: true,
			});
			if (!verify.ok) {
				await rm(fetched.path, { force: true });
				throw new Error(
					`re-fetched file failed verification: ${verify.reason}`,
				);
			}
			const placed = await createPlacer(job, placeOptions)(
				fetched.path,
				candidate,
				verify,
			);
			if (placed !== row.path) await rm(row.path, { force: true });
			const facts = await probe(placed);
			const after = (await stat(placed)).size;
			await db
				.update(libraryFile)
				.set({
					path: placed,
					codec: facts.codec,
					bitrateKbps: facts.bitrateKbps,
					sampleRateHz: facts.sampleRateHz,
					bitDepth: facts.bitDepth,
					sizeBytes: after,
					verifiedLossless: false,
				})
				.where(eq(libraryFile.id, row.id));
			result.savedBytes += before - after;
		}

		let next = 0;
		await Promise.all(
			Array.from({ length: PARALLEL }, async () => {
				while (next < todo.length) {
					const row = todo[next++];
					if (!row) break;
					try {
						await repair(row);
						result.repaired++;
					} catch (err) {
						result.failed++;
						if (result.errors.length < 50)
							result.errors.push(
								`${row.path}: ${err instanceof Error ? err.message : String(err)}`,
							);
					}
					if ((result.repaired + result.failed) % 50 === 0)
						logger.info("repair progress", {
							...result,
							errors: undefined,
							of: todo.length,
						});
				}
			}),
		);
		await requestScan();
		logger.info("repair done", {
			...result,
			savedGb: (result.savedBytes / 1e9).toFixed(1),
		});
		return result;
	},
});
