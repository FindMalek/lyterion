import { describe, expect, it, vi } from "vitest";

const rows = [
	{
		id: "a1",
		name: "Aphex",
		genres: ["idm"],
		updatedAt: new Date("2026-10-30T10:00:00Z"),
	},
	{
		id: "b2",
		name: "Bonobo",
		genres: [],
		updatedAt: new Date("2026-11-01T10:00:00Z"),
	},
];

vi.mock("@lyterion/db", () => {
	const chain: Record<string, unknown> = {};
	for (const method of ["select", "from", "innerJoin", "where"])
		chain[method] = () => chain;
	chain.orderBy = () => Promise.resolve(rows);
	return { db: chain };
});

import { followedArtists } from "../followed-artists";

describe("followedArtists", () => {
	it("returns each followed artist with genres and the newest write time", async () => {
		expect(await followedArtists()).toEqual({
			artists: [
				{ id: "a1", name: "Aphex", genres: ["idm"], image: null },
				{ id: "b2", name: "Bonobo", genres: [], image: null },
			],
			syncedAt: "2026-11-01T10:00:00.000Z",
		});
	});
});
