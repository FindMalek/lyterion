import { describe, expect, it } from "vitest";

import { deezerPreviewUrl, isPreviewMatch } from "../preview";

function noise(n: number, seed: number): number[] {
	let s = seed;
	return Array.from({ length: n }, () => {
		s = (Math.imul(s, 1664525) + 1013904223) | 0;
		return s;
	});
}

describe("preview match", () => {
	it("finds a preview cut out of the full track and rejects another track", () => {
		const full = noise(400, 1);
		const preview = full.slice(120, 280).map((n, i) => (i % 10 === 0 ? ~n : n));
		expect(isPreviewMatch(preview, full)).toBe(true);
		expect(isPreviewMatch(noise(160, 2), full)).toBe(false);
	});

	it("reads the preview url from deezer and null on an unknown isrc", async () => {
		const ok = (async () =>
			new Response(
				JSON.stringify({ preview: "https://cdn/p.mp3" }),
			)) as unknown as typeof fetch;
		const unknown = (async () =>
			new Response(
				JSON.stringify({ error: { code: 800 } }),
			)) as unknown as typeof fetch;
		expect(await deezerPreviewUrl("USEP41523003", ok)).toBe(
			"https://cdn/p.mp3",
		);
		expect(await deezerPreviewUrl("X", unknown)).toBeNull();
	});
});
