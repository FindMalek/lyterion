import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { RecordingTarget } from "../types";
import {
	createYoutubeProvider,
	entryToCandidate,
	youtubeThumbnailUrls,
} from "../youtube";

const target: RecordingTarget = {
	recordingId: "r1",
	isrcs: [],
	title: "Teardrop",
	artists: ["Massive Attack"],
	album: "Mezzanine",
	durationMs: 330_000,
	spotifyTrackId: null,
};

describe("entryToCandidate", () => {
	it("trusts Topic channels more, and drops other versions and lengths", () => {
		expect(
			entryToCandidate(target, {
				id: "a",
				title: "Teardrop",
				duration: 331,
				channel: "Massive Attack - Topic",
			}),
		).toMatchObject({
			providerId: "youtube",
			format: "opus",
			bitrateKbps: 160,
			matchConfidence: 0.85,
		});
		expect(
			entryToCandidate(target, {
				id: "b",
				title: "Teardrop",
				duration: 330,
				channel: "Some Cover Band",
			})?.matchConfidence,
		).toBe(0.6);
		expect(
			entryToCandidate(target, {
				id: "c",
				title: "Teardrop (Live at Glastonbury)",
				duration: 330,
				channel: "Massive Attack",
			}),
		).toBeNull();
		expect(
			entryToCandidate(target, {
				id: "d",
				title: "Teardrop",
				duration: 380,
				channel: "Massive Attack - Topic",
			}),
		).toBeNull();
	});
});

describe("createYoutubeProvider", () => {
	it("searches YouTube Music through yt-dlp and fetches opus into staging", async () => {
		const calls: string[][] = [];
		const staging = await mkdtemp(path.join(tmpdir(), "yt-"));
		const provider = createYoutubeProvider({
			cookiesPath: "/secrets/cookies.txt",
			run: async (args) => {
				calls.push(args);
				if (args.includes("--dump-json"))
					return [
						JSON.stringify({
							id: "vid1",
							title: "Teardrop",
							duration: 330,
							channel: "Massive Attack - Topic",
						}),
						JSON.stringify({
							id: "vid2",
							title: "Teardrop (Remix)",
							duration: 330,
							channel: "x",
						}),
						"",
					].join("\n");
				const out = args[args.indexOf("-o") + 1] ?? "";
				await writeFile(
					out.replace("%(id)s", "vid1").replace("%(ext)s", "opus"),
					"opus-bytes",
				);
				return "";
			},
		});
		const found = await provider.search(target);
		expect(found.map((c) => c.ref)).toEqual(["vid1"]);
		expect(calls[0]?.at(-1)).toBe(
			"https://music.youtube.com/search?q=massive%20attack%20teardrop#songs",
		);
		const file = await provider.fetch(found[0] as never, staging);
		expect(path.extname(file.path)).toBe(".opus");
		expect(await readFile(file.path, "utf8")).toBe("opus-bytes");
	});
});

describe("youtubeThumbnailUrls", () => {
	it("finds the video id in ids and every link shape, nothing for soundcloud", () => {
		for (const ref of [
			"dQw4w9WgXcQ",
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x",
			"https://music.youtube.com/watch?v=dQw4w9WgXcQ",
			"https://youtu.be/dQw4w9WgXcQ?t=3",
		]) {
			expect(youtubeThumbnailUrls(ref)[0]).toBe(
				"https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
			);
		}
		expect(youtubeThumbnailUrls("https://soundcloud.com/a/b")).toEqual([]);
	});
});
