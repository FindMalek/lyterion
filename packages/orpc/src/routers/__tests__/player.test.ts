import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@lyterion/env/server", () => ({
	env: { LYTERION_PLAYER_TOKEN: "secret" },
}));
vi.mock("@lyterion/common/wishlist/resolve", () => ({
	quickWish: vi.fn(),
	searchCandidates: vi.fn(async () => ({
		candidates: [{ title: "Teardrop", source: "deezer", input: "x" }],
		unreachable: ["youtube"],
	})),
}));

import { playerRouter } from "../player";

const context = (token: string) => ({
	headers: new Headers({ "x-lyterion-token": token }),
});

describe("wishlistSearch", () => {
	it("returns candidates and the unreachable sources for the player token only", async () => {
		const answer = await call(
			playerRouter.wishlistSearch,
			{ input: "teardrop" },
			{ context: context("secret") } as never,
		);
		expect(answer).toMatchObject({
			candidates: [{ title: "Teardrop" }],
			unreachable: ["youtube"],
		});
		await expect(
			call(playerRouter.wishlistSearch, { input: "teardrop" }, {
				context: context("wrong"),
			} as never),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
