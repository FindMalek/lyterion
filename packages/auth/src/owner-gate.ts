import { APIError } from "better-auth/api";

// Single owner instance (D-001): the first account wins, every later sign-up is refused.
export function ownerOnlyGate(countUsers: () => Promise<number>) {
	return async () => {
		if ((await countUsers()) > 0) {
			throw new APIError("FORBIDDEN", {
				message: "This Lyterion instance already has an owner.",
			});
		}
	};
}
