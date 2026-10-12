import { db } from "@lyterion/db";
import {
	dataImport,
	spotifyPlaylist,
	spotifyTrack,
} from "@lyterion/db/schema/spotify";
import { logger, task } from "@trigger.dev/sdk";
import { eq, inArray } from "drizzle-orm";

import type { ParsedDataExport } from "../../spotify/data-export";
import {
	albumRow,
	type LibraryExport,
	type RawTrack,
	trackRow,
} from "../../spotify/export";
import { ownerSpotifyAccount, ownerSpotifyClient } from "../../spotify/owner";
import { persistExport } from "../../spotify/persist";

function slug(name: string) {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 60) || "playlist"
	);
}

// #12: fills playlists the dev-mode API hides; additive only, so nothing is marked removed from a partial file.
export const spotifyImportTask = task({
	id: "spotify.import",
	queue: { name: "spotify", concurrencyLimit: 1 },
	maxDuration: 3600,
	run: async ({ importId }: { importId: number }) => {
		const [row] = await db
			.select()
			.from(dataImport)
			.where(eq(dataImport.id, importId));
		if (!row) throw new Error(`import ${importId} not found`);
		const parsed = row.payload as ParsedDataExport;
		try {
			const client = ownerSpotifyClient(await ownerSpotifyAccount());
			const out: LibraryExport = {
				complete: false,
				unchangedPlaylists: new Set(),
				tracks: new Map(),
				albums: new Map(),
				artists: new Map(),
				playlists: [],
				entries: [],
				saves: [],
				skipped: { episodes: 0, removed: 0 },
			};

			const wanted = new Set([
				...parsed.playlists.flatMap((p) =>
					p.items.flatMap((i) => (i.trackId ? [i.trackId] : [])),
				),
				...parsed.likedTrackIds,
			]);
			const known = wanted.size
				? new Set(
						(
							await db
								.select({ id: spotifyTrack.id })
								.from(spotifyTrack)
								.where(inArray(spotifyTrack.id, [...wanted]))
						).map((t) => t.id),
					)
				: new Set<string>();
			let enriched = 0;
			for (const id of wanted) {
				if (known.has(id)) continue;
				try {
					const track = await client.get<RawTrack & { id: string }>(
						`/tracks/${id}?market=from_token`,
					);
					if (track.album)
						out.albums.set(track.album.id, albumRow(track.album));
					out.tracks.set(id, trackRow(track, track.album?.id ?? null));
					enriched++;
				} catch (err) {
					logger.warn("track lookup failed", { id, error: String(err) });
				}
			}

			const existing = await db.select().from(spotifyPlaylist);
			let filled = 0;
			let added = 0;
			for (const p of parsed.playlists) {
				const match = existing.find((e) => e.name === p.name);
				// The API's own copy wins when it could read the items; the export only fills what dev mode hides.
				if (match && !match.itemsUnavailable) continue;
				const id = match?.id ?? `gdpr:${slug(p.name)}`;
				if (match) filled++;
				else added++;
				out.playlists.push({
					id,
					name: p.name,
					description: p.description,
					ownerId: match?.ownerId ?? null,
					snapshotId: match?.snapshotId ?? null,
					imageUrl: match?.imageUrl ?? null,
					isCollaborative: match?.isCollaborative ?? false,
					itemsUnavailable: false,
				});
				p.items.forEach((item, position) => {
					const local =
						!item.trackId ||
						(!known.has(item.trackId) && !out.tracks.has(item.trackId));
					out.entries.push({
						playlistId: id,
						position,
						spotifyTrackId: local ? null : item.trackId,
						localName: local ? item.trackName : null,
						localArtist: local ? item.artistName : null,
						localDurationMs: null,
						addedAt: item.addedAt ? new Date(item.addedAt) : null,
					});
				});
			}
			for (const id of parsed.likedTrackIds)
				if (known.has(id) || out.tracks.has(id))
					out.saves.push({ kind: "liked_track", spotifyId: id, addedAt: null });
			for (const id of parsed.savedAlbumIds)
				out.saves.push({ kind: "saved_album", spotifyId: id, addedAt: null });
			for (const id of parsed.followedArtistIds)
				out.saves.push({
					kind: "followed_artist",
					spotifyId: id,
					addedAt: null,
				});
			for (const track of out.tracks.values())
				track.artistIds.forEach((artistId, i) => {
					if (!out.artists.has(artistId))
						out.artists.set(artistId, {
							id: artistId,
							name: track.artists[i] ?? artistId,
							genres: [],
						});
				});

			await persistExport(out);
			const summary = {
				playlistsFilled: filled,
				playlistsAdded: added,
				tracksEnriched: enriched,
				saves: out.saves.length,
			};
			await db
				.update(dataImport)
				.set({ status: "done", summary })
				.where(eq(dataImport.id, importId));
			logger.info("data export imported", summary);
			return summary;
		} catch (err) {
			await db
				.update(dataImport)
				.set({ status: "failed", summary: { error: String(err) } })
				.where(eq(dataImport.id, importId));
			throw err;
		}
	},
});
