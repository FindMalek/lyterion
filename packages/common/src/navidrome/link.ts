import path from "node:path";

type LinkSong = { id: string; path?: string } & Record<string, unknown>;

// Navidrome's native API reports real paths relative to its music folder (an absolute one is cut back to it); ours are
// absolute inside our mount of the same folder.
export function linkByPath(
	files: { id: number; path: string }[],
	songs: LinkSong[],
	musicDir: string,
): Map<number, string> {
	const root = `${musicDir.replace(/\/+$/, "")}/`;
	const byPath = new Map<string, string>();
	for (const song of songs)
		if (song.path)
			byPath.set(
				(song.path.startsWith(root)
					? song.path.slice(root.length)
					: song.path
				).normalize("NFC"),
				song.id,
			);
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

type SongSource = () => Promise<LinkSong[]>;

/**
 * Navidrome 0.64 answers Subsonic with a generated path (`Artist/Album/01-05 - Title.flac`), so files are linked by
 * the real path from the native API; the Subsonic listing is only the fallback when that one fails or has no paths.
 */
export async function linkFiles(
	files: { id: number; path: string }[],
	sources: { native: SongSource; subsonic: SongSource },
	musicDir: string,
): Promise<Map<number, string>> {
	if (files.length === 0) return new Map();
	const native = await sources.native().catch(() => []);
	if (native.some((song) => song.path))
		return linkByPath(files, native, musicDir);
	return linkByPath(files, await sources.subsonic(), musicDir);
}

/**
 * The Subsonic songs with their real paths from the native listing (matched by id), for what needs the file and its
 * folder, like telling Lyterion's own subtree from the owner's files. Without a usable native listing they stay as they are.
 */
export async function withRealPaths<T extends LinkSong>(
	songs: T[],
	native: SongSource | undefined,
	musicDir: string,
): Promise<T[]> {
	const listed = native ? await native().catch(() => []) : [];
	const root = `${musicDir.replace(/\/+$/, "")}/`;
	const real = new Map<string, string>();
	for (const song of listed)
		if (song.path)
			real.set(
				song.id,
				song.path.startsWith(root) ? song.path.slice(root.length) : song.path,
			);
	if (real.size === 0) return songs;
	return songs.map((song) => ({
		...song,
		path: real.get(song.id) ?? song.path,
	}));
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
