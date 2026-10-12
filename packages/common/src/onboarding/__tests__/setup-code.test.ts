import { describe, expect, it } from "vitest";

import { generateSetupCode, normalizeSetupCode } from "../setup-code";

describe("setup code", () => {
	it("is three groups of four unambiguous characters", () => {
		const code = generateSetupCode();
		expect(code).toMatch(
			/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/,
		);
	});

	it("compares without case, spaces or dashes", () => {
		expect(normalizeSetupCode(" abcd-efgh ijkm ")).toBe("ABCDEFGHIJKM");
	});
});
