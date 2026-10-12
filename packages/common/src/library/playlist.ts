import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { sanitizeSegment } from "./layout";

// Format and rules: docs/library.md § Playlists, D-008.
const PLAYLISTS_FOLDER = "Playlists";

export type PlaylistEntry = {
	path: string | null;
	durationMs: number;
	artist: string;
	title: string;
};

export type PlaylistSpec = {
	name: string;
	description: string | null;
	entries: PlaylistEntry[];
	coverPath: string | null;
};

export function renderM3u(
	spec: PlaylistSpec,
	playlistDir: string,
): { content: string; missing: number } {
	const lines = ["#EXTM3U", `#PLAYLIST:${spec.name}`];
	if (spec.description)
		lines.push(`# ${spec.description.replace(/\s+/g, " ").trim()}`);
	let missing = 0;
	for (const entry of spec.entries) {
		if (!entry.path) {
			missing++;
			continue;
		}
		lines.push(
			`#EXTINF:${Math.round(entry.durationMs / 1000)},${entry.artist} - ${entry.title}`,
		);
		lines.push(relative(playlistDir, entry.path).split("\\").join("/"));
	}
	return { content: `${lines.join("\n")}\n`, missing };
}

async function readOrNull(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

export type WrittenPlaylist = {
	path: string;
	changed: boolean;
	missing: number;
};

export async function writePlaylist(
	spec: PlaylistSpec,
	libraryRoot: string,
): Promise<WrittenPlaylist> {
	const dir = join(libraryRoot, PLAYLISTS_FOLDER);
	const base = sanitizeSegment(spec.name);
	const path = join(dir, `${base}.m3u8`);
	const { content, missing } = renderM3u(spec, dir);
	const previous = await readOrNull(path);
	const hash = (value: string) =>
		createHash("sha256").update(value).digest("hex");
	if (previous !== null && hash(previous) === hash(content))
		return { path, changed: false, missing };

	await mkdir(dir, { recursive: true });
	await writeFile(`${path}.tmp`, content, "utf8");
	await rename(`${path}.tmp`, path);
	if (spec.coverPath) {
		const cover = join(dir, `${base}.jpg`);
		await copyFile(spec.coverPath, `${cover}.tmp`);
		await rename(`${cover}.tmp`, cover);
	}
	return { path, changed: true, missing };
}
