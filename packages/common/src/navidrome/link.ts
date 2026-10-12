import path from "node:path";

import type { SubsonicSong } from "./client";

// Navidrome reports paths relative to its music folder; ours are absolute inside our mount of the same folder.
export function linkByPath(
	files: { id: number; path: string }[],
	songs: SubsonicSong[],
	musicDir: string,
): Map<number, string> {
	const byPath = new Map<string, string>();
	for (const song of songs)
		if (song.path) byPath.set(song.path.normalize("NFC"), song.id);
	const links = new Map<number, string>();
	for (const file of files) {
		const relative = path
			.relative(musicDir, file.path)
			.split(path.sep)
			.join("/")
			.normalize("NFC");
		const songId = byPath.get(relative);
		if (songId) links.set(file.id, songId);
	}
	return links;
}

export const SCAN_BATCH = 200;
export const SCAN_QUIET_MS = 10 * 60_000;

/** Whether a debounced scan should run now (docs/library.md § Navidrome). */
export function scanDue(
	state: { pending: number; lastPlacedAt: Date | null },
	now: Date,
	force = false,
): boolean {
	if (state.pending === 0) return false;
	if (force || state.pending >= SCAN_BATCH) return true;
	return (
		!!state.lastPlacedAt &&
		now.getTime() - state.lastPlacedAt.getTime() >= SCAN_QUIET_MS
	);
}
