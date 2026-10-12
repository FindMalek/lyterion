import { describe, expect, it } from "vitest";

import { insideLibrary } from "../plan";

describe("insideLibrary (D-012)", () => {
	it("only allows paths inside Lyterion's own subtree", () => {
		expect(
			insideLibrary("/music/lyterion/A/B/01 x.flac", "/music", "lyterion"),
		).toBe(true);
		expect(
			insideLibrary("/music/beets/A/01 x.flac", "/music", "lyterion"),
		).toBe(false);
		expect(
			insideLibrary("/music/lyterion/../beets/x.flac", "/music", "lyterion"),
		).toBe(false);
		expect(
			insideLibrary("/music/lyterion-old/x.flac", "/music", "lyterion"),
		).toBe(false);
	});
});
