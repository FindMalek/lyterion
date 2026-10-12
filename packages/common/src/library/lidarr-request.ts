import { db } from "@lyterion/db";
import { recording, release, releaseTrack } from "@lyterion/db/schema/library";
import { and, eq } from "drizzle-orm";

import type { LidarrClient } from "../providers/lidarr";

// A run that misses tracks of a few dozen albums should not queue a whole discography in Lidarr at once.
const MAX_REQUESTS = 25;

/** Saved albums with a missing track; Lidarr grabs them whole and the next run copies the files (#40). */
export async function albumsWithMissingTracks() {
	const rows = await db
		.selectDistinct({
			id: release.id,
			title: release.title,
			albumArtist: release.albumArtist,
		})
		.from(release)
		.innerJoin(releaseTrack, eq(releaseTrack.releaseId, release.id))
		.innerJoin(recording, eq(recording.id, releaseTrack.recordingId))
		.where(and(eq(release.isSaved, true), eq(recording.status, "missing")));
	return rows;
}

export async function requestMissingAlbums(client: LidarrClient) {
	const albums = await albumsWithMissingTracks();
	const result = { requested: 0, notFound: [] as string[], errors: 0 };
	for (const album of albums.slice(0, MAX_REQUESTS)) {
		try {
			const found = await client.findAlbum({
				artist: album.albumArtist,
				album: album.title,
			});
			if (!found) {
				result.notFound.push(`${album.albumArtist} - ${album.title}`);
				continue;
			}
			await client.requestAlbum(found);
			result.requested++;
		} catch {
			result.errors++;
		}
	}
	return { ...result, pending: Math.max(0, albums.length - MAX_REQUESTS) };
}
