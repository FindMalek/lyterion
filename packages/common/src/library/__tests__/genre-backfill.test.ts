import { describe, expect, it, vi } from "vitest";

vi.mock("@lyterion/db", () => ({ db: {} }));

import { hasGenreTag, topGenres } from "../genre-backfill";

describe("genre backfill", () => {
	it("sees a genre tag in any case and ignores an empty one", () => {
		expect(hasGenreTag('{"format":{"tags":{"GENRE":"idm"}}}')).toBe(true);
		expect(hasGenreTag('{"format":{"tags":{"genre":" "}}}')).toBe(false);
		expect(hasGenreTag('{"format":{}}')).toBe(false);
	});

	it("keeps the first three genres, trimmed", () => {
		expect(
			topGenres([" idm ", "", "ambient", "electronica", "glitch"]),
		).toEqual(["idm", "ambient", "electronica"]);
	});
});
