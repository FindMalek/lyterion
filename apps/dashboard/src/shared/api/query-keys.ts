import { orpc } from "./orpc";

export const queryKeys = {
	me: () => orpc.me.key(),
} as const;
