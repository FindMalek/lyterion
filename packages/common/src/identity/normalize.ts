// Title parsing rules live in docs/matching.md § Normalization.

export const VERSION_FLAGS = [
	"live",
	"remix",
	"acoustic",
	"instrumental",
	"demo",
	"acapella",
	"radio_edit",
	"edit",
	"extended",
	"mono",
	"rerecorded",
	"sped_up",
	"slowed",
	"karaoke",
	"cover",
] as const;
export type VersionFlag = (typeof VERSION_FLAGS)[number];

export const NEUTRAL_TOKENS = [
	"remaster",
	"album_version",
	"single_version",
	"deluxe",
	"bonus_track",
	"explicit",
	"clean",
] as const;
export type NeutralToken = (typeof NEUTRAL_TOKENS)[number];

export type ParsedTitle = {
	base: string;
	featured: string[];
	flags: VersionFlag[];
	neutral: NeutralToken[];
	remixer?: string;
};

const FEATURING = /^(?:feat\.?|ft\.?|featuring|with|w\/)\s+(.+)$/i;

const RADIO_EDIT = /\bradio (?:edit|version|mix)\b/i;

const FLAG_PATTERNS: [VersionFlag, RegExp][] = [
	["rerecorded", /\b(?:taylor'?s version|re-?recorded|re-?record)\b/i],
	["sped_up", /\bsped[\s-]?up\b|\bspeed[\s-]?up\b|\bnightcore\b/i],
	["slowed", /\bslowed\b/i],
	["radio_edit", RADIO_EDIT],
	["live", /\blive\b/i],
	["remix", /\bremix(?:ed)?\b|\bmix\b|\brework\b|\bbootleg\b|\bvip\b/i],
	["acoustic", /\bacoustic\b|\bunplugged\b/i],
	["instrumental", /\binstrumental\b/i],
	["acapella", /\ba[\s-]?cappella\b|\bacapella\b/i],
	["demo", /\bdemo\b/i],
	["extended", /\bextended\b/i],
	["edit", /\bedit\b/i],
	["mono", /\bmono\b/i],
	["karaoke", /\bkaraoke\b/i],
	["cover", /\bcover\b/i],
];

const NEUTRAL_PATTERNS: [NeutralToken, RegExp][] = [
	["remaster", /\bremaster(?:ed)?\b/i],
	["album_version", /\balbum version\b/i],
	["single_version", /\bsingle version\b/i],
	["deluxe", /\bdeluxe\b/i],
	["bonus_track", /\bbonus track\b/i],
	["explicit", /\bexplicit\b/i],
	["clean", /\bclean\b/i],
];

export function normalizeText(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[‘’`´]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[‐-―]/g, "-")
		.replace(/\s*(?:&|\+)\s*/g, " and ")
		.replace(/[^\p{L}\p{N}' ]+/gu, " ")
		.replace(/'/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function splitArtists(value: string): string[] {
	return value
		.split(/\s*(?:,|&|\band\b|\bx\b)\s*/i)
		.map((name) => normalizeText(name))
		.filter(Boolean);
}

function splitSegments(title: string): { head: string; segments: string[] } {
	const segments: string[] = [];
	let head = title.replace(/[([]([^)\]]*)[)\]]/g, (_, inner: string) => {
		segments.push(inner.trim());
		return " ";
	});
	const dash = head.match(/\s[-–—]\s(.+)$/);
	if (dash?.[1] && dash.index !== undefined) {
		segments.push(...dash[1].split(/\s[-–—]\s/).map((s) => s.trim()));
		head = head.slice(0, dash.index);
	}
	return { head, segments };
}

function classifySegment(raw: string, parsed: ParsedTitle): boolean {
	const segment = raw.replace(/[‘’`´]/g, "'");
	if (/\boriginal mix\b/i.test(segment)) {
		if (!parsed.neutral.includes("album_version"))
			parsed.neutral.push("album_version");
		return true;
	}
	const featuring = segment.match(FEATURING);
	if (featuring?.[1]) {
		parsed.featured.push(...splitArtists(featuring[1]));
		return true;
	}
	let matched = false;
	for (const [flag, pattern] of FLAG_PATTERNS) {
		if (!pattern.test(segment)) continue;
		if ((flag === "edit" || flag === "remix") && RADIO_EDIT.test(segment))
			continue;
		if (!parsed.flags.includes(flag)) parsed.flags.push(flag);
		matched = true;
		if (flag === "remix") {
			const remixer = segment.replace(
				/\s*\b(?:remix(?:ed)?|mix|rework|bootleg|vip)\b.*$/i,
				"",
			);
			if (remixer.trim()) parsed.remixer = normalizeText(remixer);
		}
	}
	for (const [token, pattern] of NEUTRAL_PATTERNS) {
		if (!pattern.test(segment)) continue;
		if (!parsed.neutral.includes(token)) parsed.neutral.push(token);
		matched = true;
	}
	return matched;
}

export function parseTitle(title: string): ParsedTitle {
	const parsed: ParsedTitle = {
		base: "",
		featured: [],
		flags: [],
		neutral: [],
	};
	const { head, segments } = splitSegments(title);
	const kept = segments.filter((segment) => !classifySegment(segment, parsed));
	parsed.base = normalizeText([head, ...kept].join(" "));
	return parsed;
}

export function normalizeArtist(name: string): string {
	return normalizeText(name.replace(/^the\s+/i, ""));
}
