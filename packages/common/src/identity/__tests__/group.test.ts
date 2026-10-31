import { describe, expect, it } from "vitest";

import { type GroupTrack, groupRecordings } from "../group";

function track(id: string, overrides: Partial<GroupTrack> = {}): GroupTrack {
	return {
		id,
		isrc: null,
		title: "Blinding Lights",
		artists: ["The Weeknd"],
		durationMs: 200_000,
		explicit: false,
		...overrides,
	};
}

function groupsOf(
	tracks: GroupTrack[],
	options?: Parameters<typeof groupRecordings>[1],
) {
	return groupRecordings(tracks, options)
		.map((g) => g.memberIds.join("+"))
		.sort();
}

describe("groupRecordings", () => {
	it("does not fuzzy merge twins whose files are different acoustid recordings, but keeps isrc merges", () => {
		const fuzzy = [
			track("a", { acoustidRecording: "mb-1" }),
			track("b", { acoustidRecording: "mb-2", durationMs: 201_000 }),
		];
		expect(groupsOf(fuzzy)).toEqual(["a", "b"]);
		const sameIsrc = fuzzy.map((t) => ({ ...t, isrc: "USUG11904206" }));
		expect(groupsOf(sameIsrc)).toEqual(["a+b"]);
	});

	it("keeps zero length tracks with the same title apart", () => {
		const tracks = [
			track("a", { title: "Serial Killer", durationMs: 0 }),
			track("b", { title: "Serial Killer", durationMs: 0 }),
		];
		expect(groupsOf(tracks)).toEqual(["a", "b"]);
	});

	it("merges the same song across single, album and remaster but keeps other versions apart", () => {
		const tracks = [
			track("single", { isrc: "USUG11904206" }),
			track("album", { isrc: "USUG11904206", durationMs: 200_040 }),
			track("remaster", {
				title: "Blinding Lights - Remastered 2024",
				durationMs: 201_500,
			}),
			track("live", { title: "Blinding Lights - Live", durationMs: 201_000 }),
			track("radio", {
				title: "Blinding Lights - Single Version",
				durationMs: 185_000,
			}),
		];
		expect(groupsOf(tracks)).toEqual([
			"album+remaster+single",
			"live",
			"radio",
		]);
	});

	it("never re-joins tracks the owner split, even through a third track", () => {
		const tracks = [
			track("a", { isrc: "X1" }),
			track("b", { isrc: "X1" }),
			track("c", { isrc: "X1" }),
		];
		const groups = groupsOf(tracks, {
			overrides: [{ kind: "split", trackIds: ["a", "c"] }],
		});
		expect(groups).toEqual(["a+b", "c"]);
	});

	it("prefers the explicit version as the group's file", () => {
		const [group] = groupRecordings([
			track("clean", { isrc: "C1", popularity: 90 }),
			track("explicit", { isrc: "E1", explicit: true, popularity: 10 }),
		]);
		expect(group?.preferredId).toBe("explicit");
	});
});
