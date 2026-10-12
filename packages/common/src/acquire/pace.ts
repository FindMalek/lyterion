import { db } from "@lyterion/db";
import { providerSlot } from "@lyterion/db/schema/library";
import { sql } from "drizzle-orm";

/** Reserves the next start for `key`, at least `gapMs` after the previous one; returns how long to wait for it. */
export async function reserveSlot(key: string, gapMs: number): Promise<number> {
	const gap = sql`make_interval(secs => ${gapMs / 1000})`;
	const [row] = await db
		.insert(providerSlot)
		.values({ key, nextAt: sql`now() + ${gap}` })
		.onConflictDoUpdate({
			target: providerSlot.key,
			set: { nextAt: sql`greatest(${providerSlot.nextAt}, now()) + ${gap}` },
		})
		.returning({
			waitMs: sql<number>`extract(epoch from (${providerSlot.nextAt} - ${gap} - now())) * 1000`,
		});
	return Math.max(0, Number(row?.waitMs ?? 0));
}

// The database is the one clock, so two tasks on different workers still keep the gap.
export function pacer(
	key: string,
	gapMs: number,
	jitterMs = 0,
): () => Promise<void> {
	return async () => {
		const wait = await reserveSlot(
			key,
			gapMs + Math.round(Math.random() * jitterMs),
		);
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	};
}
