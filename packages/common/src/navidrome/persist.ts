import { db } from "@lyterion/db";
import {
	libraryFile,
	navidromeScanState,
	recording,
} from "@lyterion/db/schema/library";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

export async function notePlaced(count = 1): Promise<{ pending: number }> {
	const [row] = await db
		.insert(navidromeScanState)
		.values({ id: 1, pending: count, lastPlacedAt: new Date() })
		.onConflictDoUpdate({
			target: navidromeScanState.id,
			set: {
				pending: sql`${navidromeScanState.pending} + ${count}`,
				lastPlacedAt: new Date(),
			},
		})
		.returning({ pending: navidromeScanState.pending });
	return { pending: row?.pending ?? count };
}

export async function scanState() {
	const [row] = await db
		.select()
		.from(navidromeScanState)
		.where(eq(navidromeScanState.id, 1));
	return {
		pending: row?.pending ?? 0,
		lastPlacedAt: row?.lastPlacedAt ?? null,
	};
}

// Only the files counted before the scan started are cleared; anything placed during it waits for the next one.
export async function markScanned(counted: number): Promise<void> {
	await db
		.update(navidromeScanState)
		.set({
			pending: sql`greatest(${navidromeScanState.pending} - ${counted}, 0)`,
			lastScanAt: new Date(),
		})
		.where(eq(navidromeScanState.id, 1));
}

export async function unlinkedFiles() {
	return db
		.select({
			id: libraryFile.id,
			path: libraryFile.path,
			recordingId: libraryFile.recordingId,
		})
		.from(libraryFile)
		.where(isNull(libraryFile.navidromeSongId));
}

export async function saveLinks(
	links: Map<number, string>,
	files: { id: number; recordingId: string | null }[],
): Promise<number> {
	await db.transaction(async (tx) => {
		for (const [fileId, songId] of links)
			await tx
				.update(libraryFile)
				.set({ navidromeSongId: songId })
				.where(eq(libraryFile.id, fileId));
		const recordingIds = files
			.filter((f) => links.has(f.id) && f.recordingId)
			.map((f) => f.recordingId as string);
		if (recordingIds.length > 0)
			await tx
				.update(recording)
				.set({ status: "linked", updatedAt: new Date() })
				.where(
					and(
						inArray(recording.id, recordingIds),
						eq(recording.status, "placed"),
					),
				);
	});
	return links.size;
}
