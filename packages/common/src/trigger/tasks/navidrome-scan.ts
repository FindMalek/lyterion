import { env } from "@lyterion/env/server";
import { idempotencyKeys, logger, task } from "@trigger.dev/sdk";

import { getCredentials } from "../../credentials/store";
import { createNavidromeClient } from "../../navidrome/client";
import {
	linkByPath,
	SCAN_BATCH,
	SCAN_QUIET_MS,
	scanDue,
} from "../../navidrome/link";
import {
	markScanned,
	notePlaced,
	saveLinks,
	scanState,
	unlinkedFiles,
} from "../../navidrome/persist";
import { writeAllPlaylists } from "./playlists-write";
import { starsSyncTask } from "./stars-sync";

const POLL_SECONDS = 5;
const MAX_POLLS = 720;

export type ScanPayload = { force?: boolean };

// Debounced: a scan covers the whole library, so never one per track (docs/library.md § Navidrome).
export const navidromeScanTask = task({
	id: "navidrome.scan",
	queue: { name: "navidrome", concurrencyLimit: 1 },
	maxDuration: 3600,
	run: async (payload: ScanPayload) => {
		const state = await scanState();
		if (!scanDue(state, new Date(), payload.force))
			return { skipped: true, pending: state.pending };
		const creds = await getCredentials("navidrome");
		if (!creds) throw new Error("navidrome is not connected");
		const client = createNavidromeClient(creds);

		await client.startScan();
		for (let i = 0; i < MAX_POLLS; i++) {
			await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
			if (!(await client.getScanStatus()).scanning) break;
		}
		await markScanned(state.pending);

		const files = await unlinkedFiles();
		const links = linkByPath(
			files,
			files.length > 0 ? await client.allSongs() : [],
			env.LYTERION_MUSIC_DIR,
		);
		const linked = await saveLinks(links, files);
		logger.info("navidrome scan done", {
			scanned: state.pending,
			linked,
			unlinked: files.length - linked,
		});
		if (linked > 0) await starsSyncTask.trigger();
		// Navidrome imports m3u files on scan, so changed playlists count as pending for the next one.
		const playlists = await writeAllPlaylists();
		if (playlists.changed > 0) await requestScan(playlists.changed);
		return { scanned: state.pending, linked, unlinked: files.length - linked };
	},
});

/** Call after each placed file: scan now at 200 pending, else once things go quiet for 10 minutes. */
export async function requestScan(count = 1): Promise<void> {
	const { pending } = await notePlaced(count);
	// The counter moves atomically, so exactly one caller crosses each multiple of 200.
	if (
		Math.floor(pending / SCAN_BATCH) >
		Math.floor((pending - count) / SCAN_BATCH)
	) {
		await navidromeScanTask.trigger({});
		return;
	}
	// One delayed check per 10-minute window; it re-checks quietness when it fires.
	const window = Math.floor(Date.now() / SCAN_QUIET_MS);
	await navidromeScanTask.trigger(
		{},
		{
			delay: new Date((window + 2) * SCAN_QUIET_MS),
			idempotencyKey: await idempotencyKeys.create(`scan:quiet:${window}`, {
				scope: "global",
			}),
		},
	);
}
