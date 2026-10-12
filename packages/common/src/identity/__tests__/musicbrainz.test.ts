import { describe, expect, it } from "vitest";

import { barcodeVariants, createMusicBrainzClient } from "../musicbrainz";

function jsonResponse(status: number, body: unknown = {}): Response {
	return new Response(JSON.stringify(body), { status });
}

describe("musicbrainz client", () => {
	it("spaces requests and retries a 503 instead of failing", async () => {
		const calls: number[] = [];
		const responses = [
			jsonResponse(503),
			jsonResponse(200, {
				recordings: [{ id: "r1", title: "Blinding Lights", length: 200046 }],
			}),
			jsonResponse(200, { recordings: [] }),
		];
		const client = createMusicBrainzClient({
			userAgent: "test",
			minIntervalMs: 20,
			fetch: async () => {
				calls.push(Date.now());
				const next = responses.shift();
				if (!next) throw new Error("unexpected request");
				return next;
			},
		});

		const [first, second] = await Promise.all([
			client.recordingsByIsrc("USUG11904206"),
			client.recordingsByIsrc("XX0000000000"),
		]);

		expect(first).toEqual([
			{ id: "r1", title: "Blinding Lights", lengthMs: 200046 },
		]);
		expect(second).toEqual([]);
		expect(calls).toHaveLength(3);
		for (let i = 1; i < calls.length; i++) {
			expect((calls[i] ?? 0) - (calls[i - 1] ?? 0)).toBeGreaterThanOrEqual(19);
		}
	});

	it("searches every zero padded barcode form", () => {
		expect(barcodeVariants("602508575167")).toEqual([
			"602508575167",
			"0602508575167",
			"00602508575167",
		]);
	});
});
