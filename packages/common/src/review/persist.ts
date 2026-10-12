import { rm } from "node:fs/promises";

import { db } from "@lyterion/db";
import {
	candidate,
	recording,
	release,
	reviewItem,
} from "@lyterion/db/schema/library";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { SlskdRef } from "../providers/slskd";

// What the owner sees for a candidate: the file name a peer shared, or the catalog id.
export function candidateLabel(providerId: string, ref: string): string {
	try {
		if (providerId === "slskd") {
			const parsed = JSON.parse(ref) as SlskdRef;
			return `${parsed.username}: ${parsed.filename.split(/[\\/]/).slice(-3).join("/")}`;
		}
		const parsed = JSON.parse(ref) as { id?: string; backend?: string };
		return parsed.id ? `${providerId} #${parsed.id}` : ref;
	} catch {
		return ref;
	}
}

export async function openReviews() {
	const items = await db
		.select({
			id: reviewItem.id,
			reason: reviewItem.reason,
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
		.orderBy(asc(reviewItem.createdAt));
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
	return items.map((item) => ({
		...item,
		album: item.placedReleaseIds[0]
			? (albumOf.get(item.placedReleaseIds[0]) ?? null)
			: null,
		candidates: candidates
			.filter((c) => c.recordingId === item.recordingId)
			.map((c) => ({
				id: c.id,
				providerId: c.providerId,
				label: candidateLabel(c.providerId, c.ref),
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
