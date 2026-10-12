import { db } from "@lyterion/db";
import { libraryFile, recording } from "@lyterion/db/schema/library";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

export const OWNER_FLAG_PRIORITY = 4;

/** Flags only songs not already signaled, so the 15-minute poll doesn't restart running upgrades. */
export async function flagFromSignals(
	songs: { songId: string; signal: "rating" | "playlist" }[],
): Promise<number[]> {
	if (songs.length === 0) return [];
	const ids: number[] = [];
	for (const { songId, signal } of songs) {
		const rows = await db
			.update(libraryFile)
			.set({
				upgradeReason: "owner_flag",
				upgradePriority: OWNER_FLAG_PRIORITY,
				upgradeSignal: signal,
			})
			.where(
				and(
					eq(libraryFile.navidromeSongId, songId),
					eq(libraryFile.owned, true),
					isNull(libraryFile.upgradeSignal),
				),
			)
			.returning({ id: libraryFile.id });
		ids.push(...rows.map((r) => r.id));
	}
	return ids;
}

/** Owned flagged files, top priority first (D-023); never files Lyterion didn't write (D-012). */
export async function filesToUpgrade(fileIds?: number[], limit = 200) {
	return db
		.select({
			file: libraryFile,
			title: recording.title,
			artists: recording.artists,
		})
		.from(libraryFile)
		.innerJoin(recording, eq(recording.id, libraryFile.recordingId))
		.where(
			and(
				eq(libraryFile.owned, true),
				isNotNull(libraryFile.upgradeReason),
				fileIds ? inArray(libraryFile.id, fileIds) : sql`true`,
			),
		)
		.orderBy(desc(libraryFile.upgradePriority), libraryFile.id)
		.limit(limit);
}

export async function markNoBetterNotified(fileId: number) {
	await db
		.update(libraryFile)
		.set({ upgradeNotifiedAt: new Date() })
		.where(eq(libraryFile.id, fileId));
}

export async function swapFile(
	fileId: number,
	next: {
		path: string;
		codec: string;
		bitrateKbps: number | null;
		bitDepth: number | null;
		sampleRateHz: number;
		durationMs: number;
		spectralCutoffHz: number;
		verifiedLossless: boolean;
		sourceProvider: string;
		sourceRef: string;
		upgradeReason: string | null;
		upgradePriority: number | null;
		pathChanged: boolean;
	},
) {
	const { pathChanged, ...values } = next;
	await db
		.update(libraryFile)
		.set({
			...values,
			upgradeSignal: null,
			upgradeNotifiedAt: null,
			// Song ids follow tags on Navidrome ≥ 0.55 (D-023), but a new path is re-linked to be sure.
			...(pathChanged ? { navidromeSongId: null } : {}),
		})
		.where(eq(libraryFile.id, fileId));
}
