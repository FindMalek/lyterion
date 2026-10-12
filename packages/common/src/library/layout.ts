// Same shape as the beets `paths` config on the-keep (D-020), docs/library.md § Layout.
const MAX_SEGMENT_BYTES = 120;

export type LayoutInput = {
	albumArtist: string;
	artist: string;
	album: string;
	title: string;
	year: string | null;
	trackNumber: number;
	discNumber: number;
	discTotal: number;
	compilation: boolean;
	extension: string;
};

export function sanitizeSegment(value: string): string {
	let segment = value
		.normalize("NFC")
		.replace(/[/\\:*?"<>|]/g, "_")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+|[. ]+$/g, "");
	const encoder = new TextEncoder();
	while (encoder.encode(segment).length > MAX_SEGMENT_BYTES)
		segment = segment.slice(0, -1).trimEnd();
	return segment || "_";
}

export function libraryRelativePath(input: LayoutInput): string {
	const year = input.year?.slice(0, 4);
	const albumFolder = sanitizeSegment(
		year ? `${input.album} (${year})` : input.album,
	);
	const track = String(input.trackNumber).padStart(2, "0");
	const prefix = input.discTotal > 1 ? `${input.discNumber}-${track}` : track;
	const ext = input.extension.replace(/^\./, "").toLowerCase();
	if (input.compilation) {
		const file = sanitizeSegment(`${prefix} ${input.artist} - ${input.title}`);
		return `Compilations/${albumFolder}/${file}.${ext}`;
	}
	const file = sanitizeSegment(`${prefix} ${input.title}`);
	return `${sanitizeSegment(input.albumArtist)}/${albumFolder}/${file}.${ext}`;
}
