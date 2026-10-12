import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@lyterion/env/server";
import { logger, schedules } from "@trigger.dev/sdk";

import { getCredentials } from "../../credentials/store";
import { createNavidromeClient } from "../../navidrome/client";
import { notePlaced } from "../../navidrome/persist";
import {
	UPGRADE_PLAYLIST_NAME,
	UPGRADE_QUEUE_NAME,
	upgradeQueueNsp,
} from "../../upgrade/nsp";
import { flagFromSignals } from "../../upgrade/persist";
import { qualityUpgradeTask } from "./quality-upgrade";

async function ensureNsp(): Promise<boolean> {
	const dir = path.join(
		env.LYTERION_MUSIC_DIR,
		env.LYTERION_LIBRARY_SUBDIR,
		"Playlists",
	);
	const file = path.join(dir, `${UPGRADE_QUEUE_NAME}.nsp`);
	const content = upgradeQueueNsp();
	if ((await readFile(file, "utf8").catch(() => null)) === content)
		return false;
	await mkdir(dir, { recursive: true });
	await writeFile(`${file}.tmp`, content, "utf8");
	await rename(`${file}.tmp`, file);
	return true;
}

// D-032: a 1-star rating or a song added to "⇪ Upgrade" flags it, from any Subsonic client.
export const upgradeSignalsTask = schedules.task({
	id: "upgrade.signals",
	cron: "*/15 * * * *",
	maxDuration: 600,
	run: async () => {
		const creds = await getCredentials("navidrome");
		if (!creds) return { skipped: "navidrome is not connected" };
		const client = createNavidromeClient(creds);
		if (await ensureNsp()) await notePlaced(1);

		const playlists = await client.playlists();
		const queue = playlists.find((p) => p.name === UPGRADE_QUEUE_NAME);
		let editable = playlists.find((p) => p.name === UPGRADE_PLAYLIST_NAME);
		if (!editable) {
			const id = await client.createPlaylist(UPGRADE_PLAYLIST_NAME);
			editable = id ? { id, name: UPGRADE_PLAYLIST_NAME } : undefined;
		}
		const [rated, listed] = await Promise.all([
			queue ? client.playlistSongs(queue.id) : [],
			editable ? client.playlistSongs(editable.id) : [],
		]);
		const flagged = await flagFromSignals([
			...rated.map((songId) => ({ songId, signal: "rating" as const })),
			...listed.map((songId) => ({ songId, signal: "playlist" as const })),
		]);
		if (flagged.length > 0)
			await qualityUpgradeTask.trigger({ fileIds: flagged });
		logger.info("upgrade signals", {
			rated: rated.length,
			listed: listed.length,
			flagged: flagged.length,
		});
		return {
			rated: rated.length,
			listed: listed.length,
			flagged: flagged.length,
		};
	},
});
