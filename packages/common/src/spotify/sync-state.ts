import { db } from "@lyterion/db";
import {
	exportCursor,
	librarySave,
	spotifyPlaylist,
} from "@lyterion/db/schema/spotify";
import { eq, isNull } from "drizzle-orm";

import type { IncrementalState } from "./export";

const LAST_SYNC = "spotify.lastSync";
const DAILY_SYNC = "spotify.dailySync";

export type ExportMode = "full" | "incremental" | "final";

async function getCursor(key: string): Promise<string | null> {
	const [row] = await db
		.select()
		.from(exportCursor)
		.where(eq(exportCursor.key, key))
		.limit(1);
	return row?.value ?? null;
}

async function setCursor(key: string, value: string): Promise<void> {
	await db
		.insert(exportCursor)
		.values({ key, value, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: exportCursor.key,
			set: { value, updatedAt: new Date() },
		});
}

export async function syncState(): Promise<{
	dailySync: boolean;
	lastSync: string | null;
}> {
	const [daily, last] = await Promise.all([
		getCursor(DAILY_SYNC),
		getCursor(LAST_SYNC),
	]);
	return { dailySync: daily !== "off", lastSync: last };
}

/** null means there is nothing to diff against yet, so the run has to be a full export. */
export async function loadIncrementalState(): Promise<IncrementalState | null> {
	const last = await getCursor(LAST_SYNC);
	if (!last) return null;
	const [saves, playlists] = await Promise.all([
		db
			.select({ kind: librarySave.kind, id: librarySave.spotifyId })
			.from(librarySave)
			.where(isNull(librarySave.removedAt)),
		db
			.select({ id: spotifyPlaylist.id, snapshot: spotifyPlaylist.snapshotId })
			.from(spotifyPlaylist),
	]);
	return {
		since: new Date(last),
		knownSaves: new Set(saves.map((s) => `${s.kind}:${s.id}`)),
		playlistSnapshots: new Map(
			playlists.flatMap((p) =>
				p.snapshot ? [[p.id, p.snapshot] as const] : [],
			),
		),
	};
}

export async function markExported(mode: ExportMode, at: Date): Promise<void> {
	await setCursor(LAST_SYNC, at.toISOString());
	// D-029: the final export runs before Premium is cancelled and switches the daily sync off for good.
	if (mode === "final") await setCursor(DAILY_SYNC, "off");
}
