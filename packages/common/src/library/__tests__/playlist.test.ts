import {
	existsSync,
	mkdtempSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { type PlaylistSpec, writePlaylist } from "../playlist";

describe("writePlaylist", () => {
	it("writes relative paths in order with duplicates, skips missing tracks, only rewrites on change", async () => {
		const root = mkdtempSync(join(tmpdir(), "lyterion-playlist-"));
		const song = join(
			root,
			"The Weeknd/After Hours (2020)/09 Blinding Lights.flac",
		);
		const outside = "/music/Nine Inch Nails/The Slip (2008)/01 999,999.flac";
		const cover = join(root, "cover-src.jpg");
		writeFileSync(cover, "jpg");
		const spec: PlaylistSpec = {
			name: "Late night / drive",
			description: "for\nthe road",
			coverPath: cover,
			entries: [
				{
					path: song,
					durationMs: 200_046,
					artist: "The Weeknd",
					title: "Blinding Lights",
				},
				{
					path: null,
					durationMs: 180_000,
					artist: "Someone",
					title: "Not found yet",
				},
				{
					path: outside,
					durationMs: 60_000,
					artist: "Nine Inch Nails",
					title: "999,999",
				},
				{
					path: song,
					durationMs: 200_046,
					artist: "The Weeknd",
					title: "Blinding Lights",
				},
			],
		};

		const first = await writePlaylist(spec, root);

		expect(first).toMatchObject({ changed: true, missing: 1 });
		expect(first.path).toBe(join(root, "Playlists/Late night _ drive.m3u8"));
		expect(readFileSync(first.path, "utf8")).toBe(
			[
				"#EXTM3U",
				"#PLAYLIST:Late night / drive",
				"# for the road",
				"#EXTINF:200,The Weeknd - Blinding Lights",
				"../The Weeknd/After Hours (2020)/09 Blinding Lights.flac",
				"#EXTINF:60,Nine Inch Nails - 999,999",
				relative(join(root, "Playlists"), outside),
				"#EXTINF:200,The Weeknd - Blinding Lights",
				"../The Weeknd/After Hours (2020)/09 Blinding Lights.flac",
				"",
			].join("\n"),
		);
		expect(existsSync(join(root, "Playlists/Late night _ drive.jpg"))).toBe(
			true,
		);

		const mtime = statSync(first.path).mtimeMs;
		const second = await writePlaylist(spec, root);
		expect(second.changed).toBe(false);
		expect(statSync(first.path).mtimeMs).toBe(mtime);
	});
});
