import { describe, expect, it, vi } from "vitest";

const calls: {
	bin: string;
	args: string[];
	options: Record<string, unknown>;
}[] = [];
vi.mock("node:child_process", () => ({
	execFile: Object.assign(vi.fn(), {
		[Symbol.for("nodejs.util.promisify.custom")]: async (
			bin: string,
			args: string[],
			options: Record<string, unknown>,
		) => {
			calls.push({ bin, args, options });
			return { stdout: "ok" };
		},
	}),
}));

import { makeRunner } from "../youtube";

describe("makeRunner", () => {
	it("hands the timeout, a kill signal and the cookies to yt-dlp", async () => {
		await makeRunner({
			binary: "/bin/yt-dlp",
			timeoutMs: 1234,
			cookiesPath: "/c.txt",
		})(["--version"]);
		expect(calls[0]).toMatchObject({
			bin: "/bin/yt-dlp",
			options: { timeout: 1234, killSignal: "SIGKILL" },
		});
		expect(calls[0]?.args).toEqual(
			expect.arrayContaining(["--cookies", "/c.txt", "--version"]),
		);
	});
});
