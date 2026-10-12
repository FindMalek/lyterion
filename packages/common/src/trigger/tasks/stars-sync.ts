import { logger, task } from "@trigger.dev/sdk";

import { getCredentials } from "../../credentials/store";
import { createNavidromeClient } from "../../navidrome/client";
import { planStars } from "../../navidrome/stars";
import { spotifyStarTargets } from "../../navidrome/stars-persist";

const CHUNK = 100;

function chunks(ids: string[]): string[][] {
	const out: string[][] = [];
	for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK));
	return out;
}

export const starsSyncTask = task({
	id: "stars.sync",
	queue: { name: "navidrome", concurrencyLimit: 1 },
	maxDuration: 1800,
	run: async () => {
		const creds = await getCredentials("navidrome");
		if (!creds) throw new Error("navidrome is not connected");
		const client = createNavidromeClient(creds);
		const [{ wanted, removed }, current] = await Promise.all([
			spotifyStarTargets(client),
			client.starred(),
		]);
		const plan = planStars({
			wanted,
			removed,
			starred: {
				songs: new Set(current.songs),
				albums: new Set(current.albums),
				artists: new Set(current.artists),
			},
		});
		for (const [key, ids] of Object.entries(plan.star) as [
			keyof typeof plan.star,
			string[],
		][])
			for (const batch of chunks(ids)) await client.star({ [key]: batch });
		for (const [key, ids] of Object.entries(plan.unstar) as [
			keyof typeof plan.unstar,
			string[],
		][])
			for (const batch of chunks(ids)) await client.unstar({ [key]: batch });
		const summary = {
			starred:
				plan.star.id.length +
				plan.star.albumId.length +
				plan.star.artistId.length,
			unstarred:
				plan.unstar.id.length +
				plan.unstar.albumId.length +
				plan.unstar.artistId.length,
		};
		logger.info("stars synced", {
			...summary,
			songs: plan.star.id.length,
			albums: plan.star.albumId.length,
			artists: plan.star.artistId.length,
		});
		return summary;
	},
});
