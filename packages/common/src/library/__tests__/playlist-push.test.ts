import { describe, expect, it } from "vitest";

import { planPush } from "../playlist-push";

describe("planPush", () => {
	it("adds what spotify gained and never brings back a song the owner removed", () => {
		// a and b were pushed before; the owner removed b. spotify now also has c.
		const plan = planPush(["a", "b", "c"], ["a"], ["a", "b"]);
		expect(plan.add).toEqual(["c"]);
		expect(plan.pushed.sort()).toEqual(["a", "b", "c"]);
	});

	it("adds nothing right after converting from the m3u, which already has it all", () => {
		expect(planPush(["a", "b"], ["a", "b"], null).add).toEqual([]);
	});
});
