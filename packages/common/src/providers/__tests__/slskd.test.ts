import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	createSlskdProvider,
	fileMatch,
	type SlskdResponse,
	searchQuery,
	toCandidate,
} from "../slskd";
import type { RecordingTarget } from "../types";

const target: RecordingTarget = {
	recordingId: "r1",
	isrcs: ["GBUM71029604"],
	title: "Teardrop",
	artists: ["Massive Attack"],
	album: "Mezzanine",
	durationMs: 330_000,
	spotifyTrackId: "s1",
};

const peer = (
	files: SlskdResponse["files"],
	extra: Partial<SlskdResponse> = {},
): SlskdResponse => ({
	username: "peer",
	hasFreeUploadSlot: true,
	queueLength: 0,
	uploadSpeed: 1_000_000,
	files,
	...extra,
});

describe("fileMatch", () => {
	it("accepts the right track and rejects other versions, wrong lengths and other songs", () => {
		const ok = fileMatch(target, {
			filename: "@@music\\Massive Attack\\Mezzanine (1998)\\03 - Teardrop.flac",
			size: 40_000_000,
			length: 331,
		});
		expect(ok).toBeGreaterThan(0.8);
		expect(ok).toBeLessThan(1);
		expect(
			fileMatch(target, {
				filename: "Massive Attack\\Live\\Teardrop (Live).mp3",
				size: 1,
				length: 330,
			}),
		).toBe(0);
		expect(
			fileMatch(target, {
				filename: "Massive Attack\\Mezzanine\\03 Teardrop.flac",
				size: 1,
				length: 300,
			}),
		).toBe(0);
		expect(
			fileMatch(target, {
				filename: "Massive Attack\\Mezzanine\\01 Angel.flac",
				size: 1,
				length: 330,
			}),
		).toBe(0);
	});
});

describe("toCandidate", () => {
	it("maps format, estimates lossy bitrate from size, and skips locked or non-audio files", () => {
		const mp3 = toCandidate(target, peer([]), {
			filename: "Massive Attack\\Mezzanine\\03 Teardrop.mp3",
			size: 13_200_000,
			length: 330,
		});
		expect(mp3).toMatchObject({
			providerId: "slskd",
			format: "mp3",
			bitrateKbps: 320,
			isrcMatch: false,
		});
		expect(JSON.parse(mp3?.ref ?? "{}")).toEqual({
			username: "peer",
			filename: "Massive Attack\\Mezzanine\\03 Teardrop.mp3",
			size: 13_200_000,
		});
		expect(
			toCandidate(target, peer([]), {
				filename: "Massive Attack\\Mezzanine\\03 Teardrop.flac",
				size: 1,
				length: 330,
				isLocked: true,
			}),
		).toBeNull();
		expect(
			toCandidate(target, peer([]), {
				filename: "Massive Attack\\Mezzanine\\03 Teardrop.cue",
				size: 1,
			}),
		).toBeNull();
	});

	it("estimates more time for a busy peer", () => {
		const file = {
			filename: "Massive Attack\\Mezzanine\\03 Teardrop.flac",
			size: 40_000_000,
			length: 330,
		};
		const free = toCandidate(target, peer([]), file);
		const busy = toCandidate(
			target,
			peer([], { hasFreeUploadSlot: false, queueLength: 5 }),
			file,
		);
		expect(busy?.estimatedSeconds).toBeGreaterThan(free?.estimatedSeconds ?? 0);
	});
});

function fakeSlskd(responses: SlskdResponse[], downloadsDir: string) {
	const calls: string[] = [];
	let polls = 0;
	const doFetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const url = String(input).replace("http://slskd:5030/api/v0", "");
		const method = init?.method ?? "GET";
		calls.push(`${method} ${url}`);
		if (method === "POST" && url === "/searches") return Response.json({});
		if (method === "DELETE") return new Response(null, { status: 204 });
		if (url.endsWith("/responses")) return Response.json(responses);
		if (url.startsWith("/searches/"))
			return Response.json({ isComplete: true });
		if (method === "POST" && url.startsWith("/transfers/downloads/")) {
			const [file] = JSON.parse(String(init?.body)) as { filename: string }[];
			const dir = path.join(downloadsDir, "Mezzanine");
			await mkdir(dir, { recursive: true });
			await writeFile(
				path.join(dir, path.win32.basename(file?.filename ?? "")),
				"audio",
			);
			return Response.json({});
		}
		if (url.startsWith("/transfers/downloads/")) {
			polls += 1;
			return Response.json({
				directories: [
					{
						files: [
							{
								filename: "Massive Attack\\Mezzanine\\03 Teardrop.flac",
								state: polls < 2 ? "InProgress" : "Completed, Succeeded",
							},
						],
					},
				],
			});
		}
		if (url === "/application")
			return Response.json({ server: { isConnected: true, isLoggedIn: true } });
		return new Response("not found", { status: 404 });
	}) as typeof fetch;
	return { calls, doFetch };
}

describe("createSlskdProvider", () => {
	it("searches, paces searches 5s apart, fetches into staging", async () => {
		const downloads = await mkdtemp(path.join(tmpdir(), "slskd-"));
		const staging = await mkdtemp(path.join(tmpdir(), "staging-"));
		const { calls, doFetch } = fakeSlskd(
			[
				peer([
					{
						filename: "Massive Attack\\Mezzanine\\03 Teardrop.flac",
						size: 40_000_000,
						length: 330,
					},
					{
						filename: "Massive Attack\\Mezzanine\\01 Angel.flac",
						size: 40_000_000,
						length: 378,
					},
				]),
			],
			downloads,
		);
		let clock = 0;
		const slept: number[] = [];
		const provider = createSlskdProvider({
			url: "http://slskd:5030/",
			apiKey: "k",
			downloadsDir: downloads,
			fetch: doFetch,
			now: () => clock,
			sleep: async (ms) => {
				slept.push(ms);
				clock += ms;
			},
		});

		expect(searchQuery(target)).toBe("massive attack teardrop");
		const first = await provider.search(target);
		expect(first).toHaveLength(1);
		expect(first[0]).toMatchObject({ format: "flac" });
		clock += 1_000;
		await provider.search(target);
		expect(slept[0]).toBe(4_000);

		const fetched = await provider.fetch(first[0] as never, staging);
		expect(await readFile(fetched.path, "utf8")).toBe("audio");
		expect(path.dirname(fetched.path)).toBe(staging);
		expect(calls).toContain(
			"DELETE /searches/" +
				calls.find((c) => c.startsWith("GET /searches/"))?.split("/")[2],
		);
		expect(await provider.health()).toMatchObject({ ok: true });
	});

	it("album mode answers several tracks from one search", async () => {
		const downloads = await mkdtemp(path.join(tmpdir(), "slskd-"));
		const { calls, doFetch } = fakeSlskd(
			[
				peer([
					{
						filename: "Massive Attack\\Mezzanine\\01 Angel.flac",
						size: 1,
						length: 378,
					},
					{
						filename: "Massive Attack\\Mezzanine\\03 Teardrop.flac",
						size: 1,
						length: 330,
					},
				]),
			],
			downloads,
		);
		const provider = createSlskdProvider({
			url: "http://slskd:5030",
			apiKey: "k",
			downloadsDir: downloads,
			fetch: doFetch,
			sleep: async () => {},
		});
		const angel = {
			...target,
			recordingId: "r2",
			title: "Angel",
			durationMs: 378_000,
		};
		const result = await provider.searchRelease({
			artist: "Massive Attack",
			album: "Mezzanine",
			tracks: [target, angel],
		});
		expect(result.get("r1")).toHaveLength(1);
		expect(result.get("r2")).toHaveLength(1);
		expect(calls.filter((c) => c === "POST /searches")).toHaveLength(1);
	});
});
