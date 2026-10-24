import { db } from "@lyterion/db";
import { libraryFile, playlistWrite } from "@lyterion/db/schema/library";
import { eq, isNotNull } from "drizzle-orm";

import {
	createNavidromeClient,
	type NavidromeCredentials,
} from "../navidrome/client";
import { createNativeClient } from "../navidrome/native";
import { planPush } from "./playlist-push";
import { playlistSpecs } from "./playlists-persist";

/**
 * Keeps the owner's playlists editable in Navidrome (#138, replaces the read-only half of D-008). A playlist Navidrome
 * imported from Lyterion's .m3u is switched off file sync once, so it can be edited in any client; after that Navidrome
 * is the source of truth and new Spotify additions are only ever added, never re-adding what the owner removed.
 */
export async function syncPlaylistsToNavidrome(creds: NavidromeCredentials) {
	const native = createNativeClient(creds);
	const subsonic = createNavidromeClient(creds);
	const [specs, lists, files, states] = await Promise.all([
		playlistSpecs(),
		native.playlists(),
		db
			.select({ path: libraryFile.path, id: libraryFile.navidromeSongId })
			.from(libraryFile)
			.where(isNotNull(libraryFile.navidromeSongId)),
		db
			.select({ name: playlistWrite.name, pushedIds: playlistWrite.pushedIds })
			.from(playlistWrite),
	]);
	const songOf = new Map(files.map((file) => [file.path, file.id as string]));
	const pushedOf = new Map(
		states.map((state) => [state.name, state.pushedIds ?? null]),
	);
	let converted = 0;
	let added = 0;
	for (const spec of specs) {
		const playlist = lists.find(
			(item) =>
				item.name === spec.name &&
				(!item.ownerName || item.ownerName === creds.user),
		);
		// Not imported yet: the next scan picks up its .m3u, and the run after that converts it.
		if (!playlist) continue;
		let pushed = pushedOf.get(spec.name) ?? null;
		if (playlist.sync) {
			await native.stopSync(playlist.id);
			pushed = null;
			converted++;
		}
		const wanted = spec.entries.flatMap((entry) => {
			const id = entry.path ? songOf.get(entry.path) : undefined;
			return id ? [id] : [];
		});
		const plan = planPush(
			wanted,
			await subsonic.playlistSongs(playlist.id),
			pushed,
		);
		if (plan.add.length) {
			await subsonic.addToPlaylist(playlist.id, plan.add);
			added += plan.add.length;
		}
		await db
			.update(playlistWrite)
			.set({ pushedIds: plan.pushed })
			.where(eq(playlistWrite.name, spec.name));
	}
	return { converted, added };
}
