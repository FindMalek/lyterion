import { type SpotifyClient, SpotifyHttpError } from "./client";

// Endpoints and edge cases: docs/spotify.md.
type RawArtist = { id: string; name: string; genres?: string[] };
type RawImage = { url: string; width?: number | null };
type RawAlbum = {
	id: string;
	name: string;
	artists: { id: string; name: string }[];
	release_date?: string;
	release_date_precision?: string;
	album_type?: string;
	total_tracks?: number;
	images?: RawImage[];
	external_ids?: { upc?: string };
	tracks?: { items: RawTrack[]; next: string | null };
};
type RawTrack = {
	id: string | null;
	name: string;
	type?: string;
	artists: { id: string | null; name: string }[];
	album?: RawAlbum;
	disc_number?: number;
	track_number?: number;
	duration_ms: number;
	explicit?: boolean;
	popularity?: number;
	is_local?: boolean;
	external_ids?: { isrc?: string };
	linked_from?: { id: string };
};
type Paged<T> = { items: T[]; next: string | null };

export type TrackRow = {
	id: string;
	isrc: string | null;
	title: string;
	artists: string[];
	artistIds: string[];
	albumId: string | null;
	discNumber: number | null;
	trackNumber: number | null;
	durationMs: number;
	explicit: boolean;
	popularity: number | null;
	linkedFromId: string | null;
	isLocal: boolean;
};
export type AlbumRow = {
	id: string;
	upc: string | null;
	title: string;
	artists: string[];
	artistIds: string[];
	releaseDate: string | null;
	releaseDatePrecision: string | null;
	albumType: string | null;
	totalTracks: number | null;
	imageUrl: string | null;
};
export type ArtistRow = { id: string; name: string; genres: string[] };
export type PlaylistRow = {
	id: string;
	name: string;
	description: string | null;
	ownerId: string | null;
	snapshotId: string | null;
	imageUrl: string | null;
	isCollaborative: boolean;
	itemsUnavailable: boolean;
};
export type PlaylistEntryRow = {
	playlistId: string;
	position: number;
	spotifyTrackId: string | null;
	localName: string | null;
	localArtist: string | null;
	localDurationMs: number | null;
	addedAt: Date | null;
};
export type SaveRow = {
	kind: "liked_track" | "saved_album" | "followed_artist";
	spotifyId: string;
	addedAt: Date | null;
};

export type LibraryExport = {
	/** Partial lists (incremental) can't prove a removal, so persist only marks removals on full exports. */
	complete: boolean;
	unchangedPlaylists: Set<string>;
	tracks: Map<string, TrackRow>;
	albums: Map<string, AlbumRow>;
	artists: Map<string, ArtistRow>;
	playlists: PlaylistRow[];
	entries: PlaylistEntryRow[];
	saves: SaveRow[];
	skipped: { episodes: number; removed: number };
};

function largestImage(images?: RawImage[]): string | null {
	return (
		[...(images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
			?.url ?? null
	);
}

function albumRow(album: RawAlbum): AlbumRow {
	return {
		id: album.id,
		upc: album.external_ids?.upc ?? null,
		title: album.name,
		artists: album.artists.map((a) => a.name),
		artistIds: album.artists.map((a) => a.id),
		releaseDate: album.release_date ?? null,
		releaseDatePrecision: album.release_date_precision ?? null,
		albumType: album.album_type ?? null,
		totalTracks: album.total_tracks ?? null,
		imageUrl: largestImage(album.images),
	};
}

function trackRow(
	track: RawTrack & { id: string },
	albumId: string | null,
): TrackRow {
	return {
		id: track.id,
		isrc: track.external_ids?.isrc?.toUpperCase() ?? null,
		title: track.name,
		artists: track.artists.map((a) => a.name),
		artistIds: track.artists.flatMap((a) => (a.id ? [a.id] : [])),
		albumId,
		discNumber: track.disc_number ?? null,
		trackNumber: track.track_number ?? null,
		durationMs: track.duration_ms,
		explicit: track.explicit ?? false,
		popularity: track.popularity ?? null,
		linkedFromId: track.linked_from?.id ?? null,
		isLocal: false,
	};
}

export type ExportHooks = {
	onPage?: (endpoint: string, items: unknown[]) => Promise<void> | void;
};

/** Daily sync (#11, D-029): stop paging saves at known items, skip playlists whose snapshot didn't move. */
export type IncrementalState = {
	knownSaves: Set<string>;
	since: Date;
	playlistSnapshots: Map<string, string>;
};

export async function exportLibrary(
	client: SpotifyClient,
	hooks: ExportHooks = {},
	incremental?: IncrementalState,
): Promise<LibraryExport> {
	const out: LibraryExport = {
		complete: !incremental,
		unchangedPlaylists: new Set(),
		tracks: new Map(),
		albums: new Map(),
		artists: new Map(),
		playlists: [],
		entries: [],
		saves: [],
		skipped: { episodes: 0, removed: 0 },
	};
	const paged = <T>(page: unknown) => page as Paged<T>;
	// Saves come newest first, so the first known item older than the last sync means the rest is known.
	const isOld = (key: string, addedAt: string) =>
		!!incremental &&
		incremental.knownSaves.has(key) &&
		new Date(addedAt) <= incremental.since;
	const addTrack = (
		track: RawTrack,
		albumId?: string | null,
	): string | null => {
		if (!track.id || track.is_local || track.type === "episode") return null;
		if (track.album) out.albums.set(track.album.id, albumRow(track.album));
		out.tracks.set(
			track.id,
			trackRow({ ...track, id: track.id }, albumId ?? track.album?.id ?? null),
		);
		return track.id;
	};

	for await (const items of client.paginate(
		"/me/tracks?limit=50&market=from_token",
		paged<{ added_at: string; track: RawTrack | null }>,
	)) {
		await hooks.onPage?.("me/tracks", items);
		let caughtUp = false;
		for (const { added_at, track } of items) {
			const id = track ? addTrack(track) : null;
			if (id)
				out.saves.push({
					kind: "liked_track",
					spotifyId: id,
					addedAt: new Date(added_at),
				});
			else out.skipped.removed++;
			if (isOld(`liked_track:${id}`, added_at)) caughtUp = true;
		}
		if (caughtUp) break;
	}

	for await (const items of client.paginate(
		"/me/albums?limit=50&market=from_token",
		paged<{ added_at: string; album: RawAlbum }>,
	)) {
		await hooks.onPage?.("me/albums", items);
		let caughtUp = false;
		for (const { added_at, album } of items) {
			if (isOld(`saved_album:${album.id}`, added_at)) caughtUp = true;
			out.albums.set(album.id, albumRow(album));
			out.saves.push({
				kind: "saved_album",
				spotifyId: album.id,
				addedAt: new Date(added_at),
			});
			let tracks = album.tracks;
			while (tracks) {
				for (const track of tracks.items) addTrack(track, album.id);
				tracks = tracks.next
					? await client.get<Paged<RawTrack>>(tracks.next)
					: undefined;
			}
		}
		if (caughtUp) break;
	}

	for await (const items of client.paginate(
		"/me/following?type=artist&limit=50",
		(page) => {
			const artists = (page as { artists: Paged<RawArtist> }).artists;
			return { items: artists.items, next: artists.next };
		},
	)) {
		await hooks.onPage?.("me/following", items);
		for (const artist of items) {
			out.artists.set(artist.id, {
				id: artist.id,
				name: artist.name,
				genres: artist.genres ?? [],
			});
			out.saves.push({
				kind: "followed_artist",
				spotifyId: artist.id,
				addedAt: null,
			});
		}
	}

	type RawPlaylist = {
		id: string;
		name: string;
		description?: string | null;
		owner?: { id: string };
		snapshot_id?: string;
		images?: RawImage[] | null;
		collaborative?: boolean;
	};
	for await (const items of client.paginate(
		"/me/playlists?limit=50",
		paged<RawPlaylist>,
	)) {
		await hooks.onPage?.("me/playlists", items);
		for (const playlist of items) {
			const row: PlaylistRow = {
				id: playlist.id,
				name: playlist.name,
				description: playlist.description || null,
				ownerId: playlist.owner?.id ?? null,
				snapshotId: playlist.snapshot_id ?? null,
				imageUrl: largestImage(playlist.images ?? undefined),
				isCollaborative: playlist.collaborative ?? false,
				itemsUnavailable: false,
			};
			out.playlists.push(row);
			if (
				incremental &&
				playlist.snapshot_id &&
				incremental.playlistSnapshots.get(playlist.id) === playlist.snapshot_id
			) {
				out.unchangedPlaylists.add(playlist.id);
				continue;
			}
			let position = 0;
			try {
				type RawItem = {
					added_at?: string;
					is_local?: boolean;
					item?: RawTrack | null;
					track?: RawTrack | null;
				};
				for await (const entries of client.paginate(
					`/playlists/${playlist.id}/items?limit=100&market=from_token&additional_types=track`,
					paged<RawItem>,
				)) {
					await hooks.onPage?.(`playlists/${playlist.id}/items`, entries);
					for (const entry of entries) {
						const track = entry.item ?? entry.track ?? null;
						if (!track) {
							out.skipped.removed++;
							continue;
						}
						if (track.type === "episode") {
							out.skipped.episodes++;
							continue;
						}
						const local = entry.is_local || track.is_local;
						out.entries.push({
							playlistId: playlist.id,
							position: position++,
							spotifyTrackId: local ? null : addTrack(track),
							localName: local ? track.name : null,
							localArtist: local ? (track.artists[0]?.name ?? null) : null,
							localDurationMs: local ? track.duration_ms : null,
							addedAt: entry.added_at ? new Date(entry.added_at) : null,
						});
					}
				}
			} catch (err) {
				// Dev mode can refuse items of playlists the owner only follows, the GDPR export covers those.
				if (err instanceof SpotifyHttpError && err.status === 403)
					row.itemsUnavailable = true;
				else throw err;
			}
		}
	}

	for (const track of out.tracks.values()) {
		track.artistIds.forEach((id, i) => {
			if (!out.artists.has(id))
				out.artists.set(id, { id, name: track.artists[i] ?? id, genres: [] });
		});
	}
	return out;
}
