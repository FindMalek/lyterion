import { describe, expect, it } from "vitest";

import { drained } from "../stall";

describe("drained", () => {
	it("closes an acquire run with an empty queue even when the counters are a track short", () => {
		const stages = { acquire: { total: 6528, done: 3588, failed: 2939 } };
		expect(drained(stages, { inFlight: 0, waiting: 0 })).toBe(true);
		expect(drained(stages, { inFlight: 3, waiting: 0 })).toBe(false);
	});

	it("never closes a run that hasn't reached acquire", () => {
		expect(
			drained(
				{ "spotify.export": { total: 635 } },
				{ inFlight: 0, waiting: 0 },
			),
		).toBe(false);
	});
});
