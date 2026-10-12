import { rename, rm } from "node:fs/promises";

import { db } from "@lyterion/db";
import { libraryFile } from "@lyterion/db/schema/library";
import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import { createPlacer, loadAcquireJob } from "../../acquire/persist";
import { lrcPath } from "../../library/extras";
import type { AudioFormat, ProviderId } from "../../providers/types";
import { insideLibrary, reconcilePlan } from "../../reconcile/plan";
import { requestScan } from "./navidrome-scan";
import { writeAllPlaylists } from "./playlists-write";

export type ReconcilePayload = { remove?: boolean };

// Manual (docs/library.md § Reconcile): moves always apply, removals only when the owner opted in after the dry run.
export const libraryReconcileTask = task({
	id: "library.reconcile",
	queue: { name: "navidrome", concurrencyLimit: 1 },
	maxDuration: 3600,
	run: async ({ remove = false }: ReconcilePayload) => {
		const options = {
			musicDir: env.LYTERION_MUSIC_DIR,
			librarySubdir: env.LYTERION_LIBRARY_SUBDIR,
		};
		const plan = await reconcilePlan(options);
		let moved = 0;
		let removed = 0;
		for (const move of plan.moves) {
			const [file] = await db
				.select()
				.from(libraryFile)
				.where(eq(libraryFile.id, move.fileId));
			const job = await loadAcquireJob(move.recordingId);
			if (!file || !job) continue;
			// The current file is the "staged" input: placeFile retags it for the new release and renames it there.
			const placed = await createPlacer(job, {
				...options,
				python: env.LYTERION_PYTHON,
			})(
				file.path,
				{
					providerId: (file.sourceProvider ?? "library") as ProviderId,
					ref: file.sourceRef ?? "",
					format: file.codec as AudioFormat,
					isrcMatch: false,
					matchConfidence: 1,
				},
				{
					ok: true,
					facts: {
						codec: file.codec,
						sampleRateHz: file.sampleRateHz ?? 44_100,
						bitDepth: file.bitDepth,
						channels: 2,
						durationMs: file.durationMs,
						bitrateKbps: file.bitrateKbps,
					},
					fingerprint: null,
					verdict: "unknown",
					cutoffHz: file.spectralCutoffHz ?? 0,
					verifiedLossless: file.verifiedLossless,
					effectiveBitDepth: file.bitDepth,
					upgradeReason: null,
				},
			);
			await rename(lrcPath(file.path), lrcPath(placed)).catch(() => undefined);
			await db
				.update(libraryFile)
				.set({ path: placed, navidromeSongId: null })
				.where(eq(libraryFile.id, file.id));
			moved++;
		}
		if (remove) {
			for (const removal of plan.removals) {
				if (
					!insideLibrary(removal.path, options.musicDir, options.librarySubdir)
				)
					continue;
				await rm(removal.path, { force: true });
				await rm(lrcPath(removal.path), { force: true });
				await db.delete(libraryFile).where(eq(libraryFile.id, removal.fileId));
				removed++;
			}
		}
		await writeAllPlaylists();
		if (moved + removed > 0) await requestScan(moved + removed);
		logger.info("library reconciled", {
			moved,
			removed,
			unreferenced: plan.removals.length,
		});
		return { moved, removed, unreferenced: plan.removals.length };
	},
});
