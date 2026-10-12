import { randomUUID } from "node:crypto";

import { type GroupTrack, groupRecordings } from "./group";
import { parseTitle } from "./normalize";
import {
	type PlacementRelease,
	placeRecordings,
	type ReleaseType,
} from "./placement";

// identity.resolve as a pure function: Spotify rows in, recordings + releases + placements out (docs/matching.md).
export type ResolveTrack = GroupTrack & {
	albumId: string | null;
	discNumber: number | null;
	trackNumber: number | null;
};

export type ResolveAlbum = {
	id: string;
	title: string;
	artists: string[];
	albumType: string | null;
	totalTracks: number | null;
	releaseDate: string | null;
	imageUrl: string | null;
};

export type ResolveInput = {
	tracks: ResolveTrack[];
	albums: ResolveAlbum[];
	savedAlbumIds: Set<string>;
	existingMembers: Map<string, string>;
	previousPlacements?: Map<string, string[]>;
	newId?: () => string;
};

export type ResolvedRecording = {
	id: string;
	title: string;
	artists: string[];
	versionFlags: string[];
	durationMs: number;
	isrcs: string[];
	preferredSpotifyTrackId: string;
	members: { spotifyTrackId: string; edge: string }[];
	placedReleaseIds: string[];
};

export type ResolvedRelease = {
	id: string;
	spotifyAlbumId: string;
	title: string;
	albumArtist: string;
	type: ReleaseType;
	releaseDate: string | null;
	isSaved: boolean;
	coverUrl: string | null;
	totalTracks: number | null;
	tracks: {
		recordingId: string;
		discNumber: number;
		trackNumber: number | null;
	}[];
};

// Spotify files EPs under "single"; 4+ tracks there is an EP.
export function releaseType(
	albumType: string | null,
	totalTracks: number | null,
): ReleaseType {
	if (albumType === "compilation") return "compilation";
	if (albumType === "single") return (totalTracks ?? 1) >= 4 ? "ep" : "single";
	return "album";
}

export function releaseId(spotifyAlbumId: string): string {
	return `sp:${spotifyAlbumId}`;
}

export function resolveIdentity(input: ResolveInput): {
	recordings: ResolvedRecording[];
	releases: ResolvedRelease[];
} {
	const newId = input.newId ?? randomUUID;
	const byId = new Map(input.tracks.map((t) => [t.id, t]));
	const groups = groupRecordings(input.tracks);

	const recordingOfTrack = new Map<string, string>();
	const recordings: ResolvedRecording[] = groups.map((group) => {
		// Keep the id a member already had, so files, candidates and playlists stay attached across runs.
		const kept = group.memberIds
			.map((id) => input.existingMembers.get(id))
			.find((id): id is string => !!id);
		const id = kept ?? newId();
		const preferred = byId.get(group.preferredId) as ResolveTrack;
		const edgeOf = new Map<string, string>();
		for (const edge of group.edges) {
			if (!edgeOf.has(edge.to)) edgeOf.set(edge.to, edge.kind);
			if (!edgeOf.has(edge.from)) edgeOf.set(edge.from, edge.kind);
		}
		for (const member of group.memberIds) recordingOfTrack.set(member, id);
		const isrcs = [
			...new Set(
				group.memberIds
					.map((m) => byId.get(m)?.isrc?.toUpperCase())
					.filter((v): v is string => !!v),
			),
		];
		return {
			id,
			title: preferred.title,
			artists: preferred.artists,
			versionFlags: parseTitle(preferred.title).flags,
			durationMs: preferred.durationMs,
			isrcs,
			preferredSpotifyTrackId: preferred.id,
			members: group.memberIds.map((m) => ({
				spotifyTrackId: m,
				edge: m === group.preferredId ? "self" : (edgeOf.get(m) ?? "self"),
			})),
			placedReleaseIds: [],
		};
	});

	const releases: ResolvedRelease[] = input.albums.map((album) => {
		const tracks = input.tracks
			.filter((t) => t.albumId === album.id)
			.flatMap((t) => {
				const recordingId = recordingOfTrack.get(t.id);
				return recordingId
					? [
							{
								recordingId,
								discNumber: t.discNumber ?? 1,
								trackNumber: t.trackNumber,
							},
						]
					: [];
			});
		const unique = new Map(tracks.map((t) => [t.recordingId, t]));
		return {
			id: releaseId(album.id),
			spotifyAlbumId: album.id,
			title: album.title,
			albumArtist: album.artists[0] ?? "Unknown Artist",
			type: releaseType(album.albumType, album.totalTracks),
			releaseDate: album.releaseDate,
			isSaved: input.savedAlbumIds.has(album.id),
			coverUrl: album.imageUrl,
			totalTracks: album.totalTracks,
			tracks: [...unique.values()],
		};
	});

	const placementReleases: PlacementRelease[] = releases.map((r) => ({
		id: r.id,
		title: r.title,
		type: r.type,
		releaseDate: r.releaseDate,
		saved: r.isSaved,
		recordingIds: r.tracks.map((t) => t.recordingId),
	}));
	const placements = placeRecordings({
		recordingIds: recordings.map((r) => r.id),
		releases: placementReleases,
		previous: input.previousPlacements,
	});
	for (const rec of recordings) {
		const placement = placements.get(rec.id);
		if (placement?.kind === "release")
			rec.placedReleaseIds = placement.releaseIds;
	}
	return { recordings, releases };
}
