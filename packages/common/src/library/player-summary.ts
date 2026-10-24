import { playlistSpecs } from "./playlists-persist";

const MISSING_PER_PLAYLIST = 200;

export type PlayerPlaylist = {
	name: string;
	total: number;
	inLibrary: number;
	/** The songs not in the library yet; Lyterion keeps looking for them on every run. */
	missing: { artist: string; title: string }[];
};

/** Every Spotify playlist (and Liked Songs) as keep-player shows it: how much of it is in Navidrome and what isn't. */
export async function playerSummary(): Promise<{
	playlists: PlayerPlaylist[];
}> {
	const specs = await playlistSpecs();
	return {
		playlists: specs.map((spec) => {
			const missing = spec.entries.filter((entry) => !entry.path);
			return {
				name: spec.name,
				total: spec.entries.length,
				inLibrary: spec.entries.length - missing.length,
				missing: missing
					.slice(0, MISSING_PER_PLAYLIST)
					.map((entry) => ({ artist: entry.artist, title: entry.title })),
			};
		}),
	};
}
