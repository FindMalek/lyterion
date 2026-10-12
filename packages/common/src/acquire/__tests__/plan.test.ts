import { describe, expect, it } from "vitest";

import type { Candidate, Provider } from "../../providers/types";
import { planAcquire, withAlbumResults } from "../plan";

const todo = (id: string, releaseId: string | null) => ({
	id,
	generation: 0,
	releaseId,
});

describe("planAcquire", () => {
	const rows = [
		todo("a1", "A"),
		todo("a2", "A"),
		todo("a3", "A"),
		todo("b1", "B"),
		todo("b2", "B"),
		todo("s", null),
	];

	it("groups three or more wanted tracks of one release", () => {
		const plan = planAcquire(rows, true);
		expect(plan.releases).toEqual([
			{ releaseId: "A", recordings: rows.slice(0, 3) },
		]);
		expect(plan.singles.map((r) => r.id)).toEqual(["b1", "b2", "s"]);
	});

	it("keeps everything single without slskd", () => {
		expect(planAcquire(rows, false)).toEqual({ releases: [], singles: rows });
	});
});

describe("withAlbumResults", () => {
	const provider = (id: "slskd" | "proxy"): Provider => ({
		id,
		kind: "p2p",
		phase: "C",
		health: async () => ({ ok: true }),
		search: async () => {
			throw new Error(`${id} searched`);
		},
		fetch: async () => {
			throw new Error("no");
		},
	});
	const hit = { providerId: "slskd", ref: "x" } as Candidate;

	it("answers the album provider's search from the album results", async () => {
		const slskd = provider("slskd");
		const proxy = provider("proxy");
		const [p, s] = withAlbumResults([proxy, slskd], slskd, [hit]);
		expect(p).toBe(proxy);
		expect(await s?.search({} as never)).toEqual([hit]);
		expect(s?.fetch).toBe(slskd.fetch);
	});

	it("leaves a miss to its own search", () => {
		const slskd = provider("slskd");
		expect(withAlbumResults([slskd], slskd, [])[0]).toBe(slskd);
	});
});
