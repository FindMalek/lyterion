import { rm } from "node:fs/promises";

import { db } from "@lyterion/db";
import {
	candidate,
	recording,
	release,
	reviewItem,
} from "@lyterion/db/schema/library";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { candidateLabel, candidateSource, pickState } from "./source";

export { candidateLabel, candidateSource, pickState };

/** Claims an open item for a pick; false when it's already resolved or being placed. */
export async function markPicking(
	reviewId: number,
	candidateId: number,
): Promise<boolean> {
	const [row] = await db
		.select({ resolution: reviewItem.resolution })
		.from(reviewItem)
		.where(and(eq(reviewItem.id, reviewId), isNull(reviewItem.resolvedAt)));
	if (!row || pickState(row.resolution).hidden) return false;
	await db
		.update(reviewItem)
		.set({ resolution: `picking:${candidateId}:${Date.now()}` })
		.where(and(eq(reviewItem.id, reviewId), isNull(reviewItem.resolvedAt)));
	return true;
}

/** Puts a failed pick back in the queue with the reason the owner sees. */
export async function markPickFailed(
	reviewId: number,
	reason: string,
): Promise<void> {
	await db
		.update(reviewItem)
		.set({ resolution: `failed:${reason.slice(0, 500)}` })
		.where(and(eq(reviewItem.id, reviewId), isNull(reviewItem.resolvedAt)));
}

/** Open review items, for the nav badge. */
export async function openReviewCount(): Promise<number> {
	const rows = await db
		.select({ resolution: reviewItem.resolution })
		.from(reviewItem)
		.where(isNull(reviewItem.resolvedAt));
	return rows.filter((r) => !pickState(r.resolution).hidden).length;
}

export async function openReviews() {
	const items = await db
		.select({
			id: reviewItem.id,
			reason: reviewItem.reason,
			resolution: reviewItem.resolution,
			createdAt: reviewItem.createdAt,
			recordingId: recording.id,
			title: recording.title,
			artists: recording.artists,
			durationMs: recording.durationMs,
			isrcs: recording.isrcs,
			placedReleaseIds: recording.placedReleaseIds,
		})
		.from(reviewItem)
		.innerJoin(recording, eq(recording.id, reviewItem.recordingId))
		.where(isNull(reviewItem.resolvedAt))
		.orderBy(asc(reviewItem.createdAt))
		.then((rows) => rows.filter((r) => !pickState(r.resolution).hidden));
	if (items.length === 0) return [];
	const recordingIds = items.map((i) => i.recordingId);
	const [candidates, releases] = await Promise.all([
		db
			.select()
			.from(candidate)
			.where(inArray(candidate.recordingId, recordingIds))
			.orderBy(asc(candidate.rank)),
		db
			.select({ id: release.id, title: release.title })
			.from(release)
			.where(
				inArray(
					release.id,
					items.flatMap((i) => i.placedReleaseIds),
				),
			),
	]);
	const albumOf = new Map(releases.map((r) => [r.id, r.title]));
	return items.map(({ resolution, ...item }) => ({
		...item,
		lastError: pickState(resolution).lastError,
		album: item.placedReleaseIds[0]
			? (albumOf.get(item.placedReleaseIds[0]) ?? null)
			: null,
		candidates: candidates
			.filter((c) => c.recordingId === item.recordingId)
			.map((c) => ({
				id: c.id,
				providerId: c.providerId,
				label: candidateLabel(c.providerId, c.ref),
				source: candidateSource(c.providerId, c.ref),
				format: c.format,
				bitrateKbps: c.bitrateKbps,
				bitDepth: c.bitDepth,
				durationMs: c.durationMs,
				matchConfidence: c.matchConfidence,
				state: c.state,
				failureReason: c.failureReason,
				previewable: !!c.stagedPath,
			})),
	}));
}

export async function stagedCandidate(candidateId: number) {
	const [row] = await db
		.select()
		.from(candidate)
		.where(eq(candidate.id, candidateId))
		.limit(1);
	return row ?? null;
}

export async function reviewForRecording(reviewId: number) {
	const [row] = await db
		.select()
		.from(reviewItem)
		.where(eq(reviewItem.id, reviewId))
		.limit(1);
	return row ?? null;
}

export async function resolveReview(
	reviewId: number,
	resolution: string,
): Promise<void> {
	await db
		.update(reviewItem)
		.set({ resolvedAt: new Date(), resolution })
		.where(and(eq(reviewItem.id, reviewId), isNull(reviewItem.resolvedAt)));
}

export async function skipRecording(reviewId: number): Promise<void> {
	const review = await reviewForRecording(reviewId);
	if (!review) return;
	await db.transaction(async (tx) => {
		await tx
			.update(reviewItem)
			.set({ resolvedAt: new Date(), resolution: "skipped" })
			.where(eq(reviewItem.id, reviewId));
		await tx
			.update(recording)
			.set({ status: "skipped", updatedAt: new Date() })
			.where(eq(recording.id, review.recordingId));
	});
	await discardStaged(review.recordingId);
}

/** Deletes every kept near-miss file of a recording once the owner decided. */
export async function discardStaged(
	recordingId: string,
	keep?: number,
): Promise<void> {
	const rows = await db
		.select({ id: candidate.id, stagedPath: candidate.stagedPath })
		.from(candidate)
		.where(eq(candidate.recordingId, recordingId));
	for (const row of rows) {
		if (!row.stagedPath || row.id === keep) continue;
		await rm(row.stagedPath, { force: true });
		await db
			.update(candidate)
			.set({ stagedPath: null })
			.where(eq(candidate.id, row.id));
	}
}
