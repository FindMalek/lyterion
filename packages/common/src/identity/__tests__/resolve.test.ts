import { describe, expect, it } from "vitest";

import { type ResolveTrack, releaseType, resolveIdentity } from "../resolve";

const track = (over: Partial<ResolveTrack> & { id: string }): ResolveTrack => ({
	isrc: null,
	title: "Teardrop",
	artists: ["Massive Attack"],
	durationMs: 330_000,
	explicit: false,
	albumId: null,
	discNumber: 1,
	trackNumber: 1,
	...over,
});

const albums = [
	{
		id: "mezz",
		title: "Mezzanine",
		artists: ["Massive Attack"],
		albumType: "album",
		totalTracks: 11,
		releaseDate: "1998",
		imageUrl: null,
	},
	{
		id: "best",
		title: "Collected",
		artists: ["Massive Attack"],
		albumType: "compilation",
		totalTracks: 18,
		releaseDate: "2006",
		imageUrl: null,
	},
];

describe("resolveIdentity", () => {
	const tracks = [
		track({
			id: "t-album",
			isrc: "GBUM71029604",
			albumId: "mezz",
			trackNumber: 3,
			popularity: 70,
		}),
		track({
			id: "t-comp",
			isrc: "GBUM71029604",
			albumId: "best",
			trackNumber: 5,
			popularity: 40,
		}),
		track({ id: "t-live", title: "Teardrop - Live", albumId: null }),
	];
	let n = 0;
	const newId = () => `new-${++n}`;

	it("merges same-ISRC tracks into one recording and keeps live takes apart", () => {
		const { recordings } = resolveIdentity({
			tracks,
			albums,
			savedAlbumIds: new Set(),
			existingMembers: new Map(),
			newId,
		});
		expect(recordings).toHaveLength(2);
		const studio = recordings.find((r) => r.members.length === 2);
		expect(studio).toMatchObject({
			preferredSpotifyTrackId: "t-album",
			isrcs: ["GBUM71029604"],
		});
		expect(
			studio?.members.find((m) => m.spotifyTrackId === "t-comp")?.edge,
		).toBe("isrc");
		expect(
			recordings.find((r) => r.versionFlags.includes("live")),
		).toBeDefined();
	});

	it("keeps recording ids stable across runs", () => {
		const { recordings } = resolveIdentity({
			tracks,
			albums,
			savedAlbumIds: new Set(),
			existingMembers: new Map([["t-comp", "rec-old"]]),
			newId,
		});
		expect(recordings.find((r) => r.members.length === 2)?.id).toBe("rec-old");
	});

	it("places on the album over the compilation, and on a saved compilation when saved", () => {
		const scored = resolveIdentity({
			tracks,
			albums,
			savedAlbumIds: new Set(),
			existingMembers: new Map(),
			newId,
		});
		const studio = scored.recordings.find((r) => r.members.length === 2);
		expect(studio?.placedReleaseIds).toEqual(["sp:mezz"]);
		expect(scored.releases.find((r) => r.id === "sp:mezz")?.tracks).toEqual([
			{ recordingId: studio?.id, discNumber: 1, trackNumber: 3 },
		]);

		const saved = resolveIdentity({
			tracks,
			albums,
			savedAlbumIds: new Set(["best"]),
			existingMembers: new Map(),
			newId,
		});
		expect(
			saved.recordings.find((r) => r.members.length === 2)?.placedReleaseIds,
		).toEqual(["sp:best"]);
	});
});

describe("releaseType", () => {
	it("maps Spotify album types, with 4+ track singles as EPs", () => {
		expect(releaseType("album", 10)).toBe("album");
		expect(releaseType("single", 1)).toBe("single");
		expect(releaseType("single", 5)).toBe("ep");
		expect(releaseType("compilation", 20)).toBe("compilation");
	});
});
