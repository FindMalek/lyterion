import { describe, expect, it } from "vitest";

import { ownerOnlyGate } from "../owner-gate";

describe("ownerOnlyGate", () => {
	it("lets the first account in and refuses every one after it", async () => {
		await expect(ownerOnlyGate(async () => 0)()).resolves.toBeUndefined();
		await expect(ownerOnlyGate(async () => 1)()).rejects.toMatchObject({
			statusCode: 403,
		});
	});
});
