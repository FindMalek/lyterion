import { describe, expect, it } from "vitest";

import { scrub, sendReport } from "../report";

describe("telemetry", () => {
	it("scrubs query strings and secrets", () => {
		expect(scrub("fail https://x.test/a?token=abc")).toBe(
			"fail https://x.test/a",
		);
		expect(scrub("password=hunter2")).toBe("password=[redacted]");
	});

	it("sends an error to glitchtip and o2, and nothing when off", async () => {
		const calls: string[] = [];
		const fetcher = (async (url: string) => {
			calls.push(url);
			return new Response();
		}) as unknown as typeof fetch;
		const base = {
			dsn: "https://key@gt.test/3",
			o2: {
				url: "http://o2",
				org: "default",
				stream: "lyterion",
				auth: "Basic x",
			},
			fetcher,
		};
		await sendReport({ ...base, on: false }, "error", "t", new Error("x"));
		expect(calls).toEqual([]);
		await sendReport({ ...base, on: true }, "error", "t", new Error("x"));
		expect(calls.sort()).toEqual([
			"http://o2/api/default/lyterion/_json",
			"https://gt.test/api/3/store/",
		]);
	});
});
