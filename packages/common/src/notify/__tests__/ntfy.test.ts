import { describe, expect, it } from "vitest";

import { createNotifier } from "../ntfy";

describe("createNotifier", () => {
	it("posts to the topic with auth, and batches review pings to one an hour", async () => {
		const sent: {
			url: string;
			headers: Record<string, string>;
			body: string;
		}[] = [];
		let clock = 0;
		const notifier = createNotifier(
			{ url: "https://ntfy.example/", topic: "lyterion", token: "tk" },
			async (url, init) => {
				sent.push({
					url: String(url),
					headers: init?.headers as Record<string, string>,
					body: String(init?.body),
				});
				return new Response("{}");
			},
			() => clock,
		);

		await notifier.notify({ kind: "review_needed", count: 2 });
		clock += 10 * 60_000;
		expect(await notifier.notify({ kind: "review_needed", count: 3 })).toBe(
			false,
		);
		clock += 60 * 60_000;
		await notifier.notify({ kind: "review_needed", count: 1 });
		await notifier.notify({
			kind: "upgrade",
			artist: "The Weeknd",
			title: "Blinding Lights",
			from: "MP3 128",
			to: "FLAC 16/44.1",
		});

		expect(sent.map((s) => s.body)).toEqual([
			"2 tracks need review",
			"4 tracks need review",
			"upgraded The Weeknd – Blinding Lights: MP3 128 → FLAC 16/44.1",
		]);
		expect(sent[0]).toMatchObject({
			url: "https://ntfy.example/lyterion",
			headers: { authorization: "Bearer tk" },
		});
	});
});
