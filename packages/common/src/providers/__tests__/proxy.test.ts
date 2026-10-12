import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	createProxyProvider,
	findItems,
	streamUrl,
	trackToCandidate,
} from "../proxy";
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

const teardrop = {
	id: 1,
	title: "Teardrop",
	duration: 331,
	isrc: "GBUM71029604",
	audioQuality: "LOSSLESS",
	artist: { name: "Massive Attack" },
};

describe("parsing", () => {
	it("finds items in plain and v2-wrapped responses", () => {
		expect(findItems({ items: [teardrop] })).toHaveLength(1);
		expect(
			findItems({ version: "2.0", data: { items: [teardrop] } }),
		).toHaveLength(1);
		expect(findItems({ nothing: true })).toEqual([]);
	});

	it("reads a direct url or a BTS manifest, and refuses DASH", () => {
		expect(
			streamUrl([
				{ audioQuality: "LOSSLESS" },
				{ OriginalTrackUrl: "https://cdn/a" },
			]),
		).toEqual({
			url: "https://cdn/a",
			ext: "flac",
		});
		const manifest = Buffer.from(
			JSON.stringify({ urls: ["https://cdn/b"], codecs: "flac" }),
		).toString("base64");
		expect(
			streamUrl({
				data: { manifestMimeType: "application/vnd.tidal.bts", manifest },
			}),
		).toEqual({ url: "https://cdn/b", ext: "flac" });
		expect(() =>
			streamUrl({ manifestMimeType: "application/dash+xml", manifest: "eA==" }),
		).toThrow(/dash/);
	});
});

describe("trackToCandidate", () => {
	it("treats an ISRC hit as exact lossless", () => {
		expect(trackToCandidate(target, "https://a", teardrop)).toMatchObject({
			providerId: "proxy",
			format: "flac",
			isrcMatch: true,
			matchConfidence: 1,
		});
	});

	it("falls back to title, artist and duration, and rejects other versions", () => {
		const noIsrc = { ...teardrop, isrc: undefined };
		expect(trackToCandidate(target, "https://a", noIsrc)).toMatchObject({
			isrcMatch: false,
			matchConfidence: 0.9,
		});
		expect(
			trackToCandidate(target, "https://a", { ...noIsrc, version: "Live" }),
		).toBeNull();
		expect(
			trackToCandidate(target, "https://a", { ...noIsrc, duration: 200 }),
		).toBeNull();
		expect(
			trackToCandidate(target, "https://a", {
				...noIsrc,
				artist: { name: "Portishead" },
			}),
		).toBeNull();
		expect(
			trackToCandidate(target, "https://a", {
				...teardrop,
				audioQuality: "HIGH",
			}),
		).toMatchObject({ format: "aac", bitrateKbps: 320 });
	});
});

describe("createProxyProvider", () => {
	it("rotates past a dead backend, cools it down, and fetches the stream into staging", async () => {
		const hits: string[] = [];
		let clock = 0;
		const provider = createProxyProvider({
			backends: ["https://dead.example/", "https://live.example"],
			now: () => clock,
			fetch: (async (input: string | URL | Request) => {
				const url = String(input);
				hits.push(url.split("?")[0] ?? url);
				if (url.startsWith("https://dead.example"))
					return new Response("down", { status: 502 });
				if (url.includes("/search/"))
					return Response.json({ items: [teardrop] });
				if (url.includes("/track/"))
					return Response.json([
						{ audioQuality: "LOSSLESS" },
						{ OriginalTrackUrl: "https://cdn.example/file" },
					]);
				if (url === "https://cdn.example/file")
					return new Response("flacbytes");
				return new Response("?", { status: 404 });
			}) as typeof fetch,
		});

		const [best] = await provider.search(target);
		expect(best).toMatchObject({ isrcMatch: true });
		expect(JSON.parse(best?.ref ?? "{}")).toEqual({
			backend: "https://live.example",
			id: "1",
		});

		hits.length = 0;
		await provider.search(target);
		expect(hits.some((h) => h.startsWith("https://dead.example"))).toBe(false);

		const staging = await mkdtemp(path.join(tmpdir(), "proxy-"));
		const file = await provider.fetch(best as never, staging);
		expect(path.extname(file.path)).toBe(".flac");
		expect(await readFile(file.path, "utf8")).toBe("flacbytes");

		clock += 16 * 60_000;
		expect(await provider.health()).toMatchObject({
			ok: true,
			detail: "1/2 up",
		});
	});
});
