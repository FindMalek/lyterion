import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

// Only the boundaries are faked: yt-dlp (child process) and the Deezer network call.
vi.mock("@lyterion/env/server", () => ({
	env: { LYTERION_PLAYER_TOKEN: "secret", LYTERION_YTDLP_PATH: "yt-dlp" },
}));
vi.mock("node:child_process", () => {
	const execFile = Object.assign(vi.fn(), {
		[Symbol.for("nodejs.util.promisify.custom")]: async (
			_bin: string,
			args: string[],
		) => {
			if (args.some((a) => a.startsWith("scsearch"))) throw new Error("down");
			if (args.includes("--version")) return { stdout: "1" };
			return {
				stdout: `${JSON.stringify({ id: "abc", title: "Massive Attack - Teardrop", duration: 330, uploader: "MA" })}\n`,
			};
		},
	});
	return { execFile };
});
vi.stubGlobal(
	"fetch",
	vi.fn(async () =>
		Response.json({
			data: [
				{
					id: 7,
					title: "Teardrop",
					duration: 327,
					artist: { name: "Massive Attack" },
				},
			],
		}),
	),
);

import { playerRouter } from "../player";

const context = (token: string) => ({
	headers: new Headers({ "x-lyterion-token": token }),
});

describe("wishlistSearch", () => {
	it("merges sources, names the one that is down, and wants the player token", async () => {
		const answer = await call(
			playerRouter.wishlistSearch,
			{ input: "teardrop" },
			{ context: context("secret") } as never,
		);
		expect(answer.candidates.map((c) => c.source)).toEqual([
			"deezer",
			"youtube",
		]);
		expect(answer.unreachable).toEqual(["soundcloud"]);
		await expect(
			call(playerRouter.wishlistSearch, { input: "teardrop" }, {
				context: context("wrong"),
			} as never),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
