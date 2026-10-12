import { describe, expect, it } from "vitest";

import { parseDataExport } from "../data-export";

const ID = "4uLU6hMCjMI75M1A2tKUQC";

describe("parseDataExport", () => {
	it("reads playlists with track URIs and the library's likes, saves and follows", () => {
		const out = parseDataExport({
			"Spotify Account Data/Playlist1.json": JSON.stringify({
				playlists: [
					{
						name: "Followed mix",
						lastModifiedDate: "2024-01-01",
						items: [
							{
								track: {
									trackName: "Teardrop",
									artistName: "Massive Attack",
									albumName: "Mezzanine",
									trackUri: `spotify:track:${ID}`,
								},
								addedDate: "2024-01-02",
							},
							{ track: null, episode: { episodeName: "pod" } },
							{ track: { trackName: "Demo", artistName: "Me" } },
						],
					},
				],
			}),
			"Spotify Account Data/YourLibrary.json": JSON.stringify({
				tracks: [
					{
						artist: "Massive Attack",
						album: "Mezzanine",
						track: "Teardrop",
						uri: `spotify:track:${ID}`,
					},
				],
				albums: [{ uri: "spotify:album:1d9dd5gxGGNLFGBqXyLnvT" }],
				artists: [
					{
						name: "Massive Attack",
						uri: "spotify:artist:6FXMGgJwohJLUSr5nVlf9X",
					},
				],
			}),
			"Spotify Account Data/StreamingHistory0.json": "[]",
		});
		expect(out.playlists).toHaveLength(1);
		expect(out.playlists[0]?.items).toEqual([
			{
				trackId: ID,
				trackName: "Teardrop",
				artistName: "Massive Attack",
				albumName: "Mezzanine",
				addedAt: "2024-01-02",
			},
			{
				trackId: null,
				trackName: "Demo",
				artistName: "Me",
				albumName: null,
				addedAt: null,
			},
		]);
		expect(out.likedTrackIds).toEqual([ID]);
		expect(out.savedAlbumIds).toEqual(["1d9dd5gxGGNLFGBqXyLnvT"]);
		expect(out.followedArtistIds).toEqual(["6FXMGgJwohJLUSr5nVlf9X"]);
	});
});
