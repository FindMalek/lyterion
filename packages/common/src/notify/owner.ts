import { db } from "@lyterion/db";
import { recording, reviewItem } from "@lyterion/db/schema/library";
import { exportCursor } from "@lyterion/db/schema/spotify";
import { count, eq, isNull } from "drizzle-orm";

import { getCredentials } from "../credentials/store";
import { createNotifier, type NotifyEvent } from "./ntfy";

const REVIEW_EVERY_MS = 60 * 60_000;

export async function notifyOwner(event: NotifyEvent): Promise<void> {
	const ntfy = await getCredentials("ntfy");
	if (!ntfy) return;
	await createNotifier({
		url: ntfy.url,
		topic: ntfy.topic,
		token: ntfy.token || undefined,
	}).notify(event);
}

async function cursor(key: string): Promise<string | null> {
	const [row] = await db
		.select()
		.from(exportCursor)
		.where(eq(exportCursor.key, key))
		.limit(1);
	return row?.value ?? null;
}

export async function setCursor(key: string, value: string): Promise<void> {
	await db
		.insert(exportCursor)
		.values({ key, value, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: exportCursor.key,
			set: { value, updatedAt: new Date() },
		});
}

export { cursor as getCursor };

// D-031: one "N tracks need review" an hour at most; tasks are separate processes, so the throttle lives in the db.
export async function notifyReviewNeeded(now = new Date()): Promise<boolean> {
	const last = await cursor("ntfy.reviewAt");
	if (last && now.getTime() - new Date(last).getTime() < REVIEW_EVERY_MS)
		return false;
	const [open] = await db
		.select({ n: count() })
		.from(reviewItem)
		.where(isNull(reviewItem.resolvedAt));
	if (!open?.n) return false;
	await setCursor("ntfy.reviewAt", now.toISOString());
	await notifyOwner({ kind: "review_needed", count: open.n });
	return true;
}

export async function runSummary(): Promise<{ text: string; failed: boolean }> {
	const rows = await db
		.select({ status: recording.status, n: count() })
		.from(recording)
		.groupBy(recording.status);
	const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
	const done = (by.placed ?? 0) + (by.linked ?? 0) + (by.existing ?? 0);
	const missing = by.missing ?? 0;
	const review = by.review ?? 0;
	return {
		text: `${done} in the library, ${missing} missing, ${review} to review`,
		failed: missing + review > 0,
	};
}
