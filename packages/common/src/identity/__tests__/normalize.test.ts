import { describe, expect, it } from "vitest";

import { normalizeArtist, normalizeText, parseTitle } from "../normalize";

describe("parseTitle", () => {
	it.each([
		[
			"Blinding Lights",
			{ base: "blinding lights", flags: [], neutral: [], featured: [] },
		],
		[
			"Mr. Brightside - Remastered 2020",
			{ base: "mr brightside", flags: [], neutral: ["remaster"] },
		],
		[
			"Smells Like Teen Spirit - 2021 Remaster",
			{ base: "smells like teen spirit", neutral: ["remaster"] },
		],
		[
			"Bohemian Rhapsody - Live Aid",
			{ base: "bohemian rhapsody", flags: ["live"] },
		],
		["Levitating (feat. DaBaby)", { base: "levitating", featured: ["dababy"] }],
		[
			"Get Lucky (Radio Edit) [feat. Pharrell Williams & Nile Rodgers]",
			{
				base: "get lucky",
				flags: ["radio_edit"],
				featured: ["pharrell williams", "nile rodgers"],
			},
		],
		[
			"Love Story (Taylor’s Version)",
			{ base: "love story", flags: ["rerecorded"] },
		],
		[
			"Sweater Weather - Sped Up",
			{ base: "sweater weather", flags: ["sped_up"] },
		],
		[
			"Titanium - David Guetta Remix",
			{ base: "titanium", flags: ["remix"], remixer: "david guetta" },
		],
		[
			"Strobe - Original Mix",
			{ base: "strobe", flags: [], neutral: ["album_version"] },
		],
		[
			"One More Time - Radio Mix",
			{ base: "one more time", flags: ["radio_edit"] },
		],
		[
			"Wish You Were Here - Acoustic Version",
			{ base: "wish you were here", flags: ["acoustic"] },
		],
		[
			"Yesterday - Mono / Remastered 2009",
			{ base: "yesterday", flags: ["mono"], neutral: ["remaster"] },
		],
		["Song (Part 2)", { base: "song part 2", flags: [] }],
		["Live Forever", { base: "live forever", flags: [] }],
	])("%s", (title, expected) => {
		expect(parseTitle(title)).toMatchObject(expected);
	});
});

describe("normalizeText / normalizeArtist", () => {
	it("folds diacritics, punctuation, ampersands and leading 'the'", () => {
		expect(normalizeText("Beyoncé")).toBe("beyonce");
		expect(normalizeText("Simon & Garfunkel")).toBe("simon and garfunkel");
		expect(normalizeText("AC/DC")).toBe("ac dc");
		expect(normalizeArtist("The Weeknd")).toBe("weeknd");
	});
});
