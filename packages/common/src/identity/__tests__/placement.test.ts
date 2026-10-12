import { describe, expect, it } from "vitest";

import { type PlacementRelease, placeRecordings } from "../placement";

function release(
	id: string,
	recordingIds: string[],
	overrides: Partial<PlacementRelease> = {},
): PlacementRelease {
	return {
		id,
		title: id,
		type: "album",
		releaseDate: "2020-01-01",
		saved: false,
		recordingIds,
		...overrides,
	};
}

describe("placeRecordings", () => {
	it("puts a song on the album other wanted songs share, not its single", () => {
		const placements = placeRecordings({
			recordingIds: ["hit", "b", "c"],
			releases: [
				release("single", ["hit"], {
					type: "single",
					releaseDate: "2019-06-01",
				}),
				release("album", ["hit", "b", "c", "x"]),
				release("deluxe", ["hit", "b", "c", "x", "y"], {
					title: "Album (Deluxe Edition)",
				}),
			],
		});
		expect(placements.get("hit")).toEqual({
			kind: "release",
			releaseIds: ["album"],
			reason: "scored",
		});
	});

	it("keeps every saved album complete, or one copy when collapsing", () => {
		const releases = [
			release("original", ["song"], { saved: true }),
			release("best-of", ["song"], { type: "compilation", saved: true }),
			release("other", ["song"]),
		];
		expect(
			placeRecordings({ recordingIds: ["song"], releases }).get("song"),
		).toMatchObject({
			releaseIds: ["original", "best-of"],
			reason: "saved",
		});
		expect(
			placeRecordings({
				recordingIds: ["song"],
				releases,
				savedAlbumPolicy: "collapse",
			}).get("song"),
		).toMatchObject({ releaseIds: ["original"] });
	});

	it("keeps an earlier placement unless a saved album now claims the song", () => {
		const previous = new Map([["song", ["single"]]]);
		const releases = [
			release("single", ["song"], { type: "single" }),
			release("album", ["song", "b"]),
		];
		expect(
			placeRecordings({ recordingIds: ["song", "b"], releases, previous }).get(
				"song",
			),
		).toMatchObject({ releaseIds: ["single"], reason: "sticky" });

		const savedNow = releases.map((r) =>
			r.id === "album" ? { ...r, saved: true } : r,
		);
		expect(
			placeRecordings({
				recordingIds: ["song", "b"],
				releases: savedNow,
				previous,
			}).get("song"),
		).toMatchObject({ releaseIds: ["album"], reason: "saved" });
	});

	it("never places a song the library already has", () => {
		const placements = placeRecordings({
			recordingIds: ["song"],
			releases: [release("album", ["song"], { saved: true })],
			existingRecordingIds: new Set(["song"]),
		});
		expect(placements.get("song")).toEqual({ kind: "existing" });
	});
});
