import { db } from "@lyterion/db";
import { providerHealth } from "@lyterion/db/schema/library";
import { logger, schedules } from "@trigger.dev/sdk";

import { configuredProviders } from "../../credentials/providers";
import { getCursor, notifyOwner, setCursor } from "../../notify/owner";

const ALERT_AFTER_MS = 60 * 60_000;

// D-031 health: a provider down for over an hour pings once; it pings again when it recovers.
export const providersHealthTask = schedules.task({
	id: "providers.health",
	cron: "*/15 * * * *",
	maxDuration: 300,
	run: async () => {
		const now = Date.now();
		const results: Record<string, string> = {};
		for (const provider of await configuredProviders()) {
			const health = await provider.health().catch((err: unknown) => ({
				ok: false,
				detail: err instanceof Error ? err.message : String(err),
			}));
			await db.insert(providerHealth).values({
				providerId: provider.id,
				ok: health.ok,
				latencyMs: "latencyMs" in health ? (health.latencyMs ?? null) : null,
				detail: health.detail ?? null,
			});
			const downKey = `health.${provider.id}.downSince`;
			const alertKey = `health.${provider.id}.alerted`;
			const downSince = await getCursor(downKey);
			if (health.ok) {
				if (downSince) {
					await setCursor(downKey, "");
					if ((await getCursor(alertKey)) === "1") {
						await setCursor(alertKey, "0");
						await notifyOwner({
							kind: "health",
							subject: `${provider.id} is back`,
							detail: health.detail ?? "ok",
						});
					}
				}
			} else if (!downSince) {
				await setCursor(downKey, new Date(now).toISOString());
			} else if (
				now - new Date(downSince).getTime() >= ALERT_AFTER_MS &&
				(await getCursor(alertKey)) !== "1"
			) {
				await setCursor(alertKey, "1");
				await notifyOwner({
					kind: "health",
					subject: `${provider.id} is down`,
					detail: health.detail ?? "no detail",
				});
			}
			results[provider.id] = health.ok ? "ok" : `down: ${health.detail ?? ""}`;
		}
		logger.info("providers health", results);
		return results;
	},
});
