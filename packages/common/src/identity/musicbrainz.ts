const API = "https://musicbrainz.org/ws/2";
// MusicBrainz allows 1 request/s per IP and answers 503 when exceeded.
const DEFAULT_MIN_INTERVAL_MS = 1_000;
const MAX_ATTEMPTS = 4;

export type MbArtistCredit = { name: string; artistId: string };

export type MbTrack = {
	position: number;
	discNumber: number;
	title: string;
	lengthMs: number | null;
	recordingId: string;
	isrcs: string[];
};

export type MbRelease = {
	id: string;
	title: string;
	date: string | null;
	barcode: string | null;
	status: string | null;
	releaseGroupId: string;
	primaryType: string | null;
	secondaryTypes: string[];
	firstReleaseDate: string | null;
	artistCredit: MbArtistCredit[];
	tracks: MbTrack[];
};

export type MbRecording = {
	id: string;
	title: string;
	lengthMs: number | null;
};

type RawArtistCredit = { name: string; artist: { id: string } };
type RawRelease = {
	id: string;
	title: string;
	date?: string;
	barcode?: string | null;
	status?: string | null;
	"release-group"?: {
		id: string;
		"primary-type"?: string | null;
		"secondary-types"?: string[];
		"first-release-date"?: string;
	};
	"artist-credit"?: RawArtistCredit[];
	media?: {
		position: number;
		tracks?: {
			position: number;
			title: string;
			length?: number | null;
			recording: { id: string; isrcs?: string[] };
		}[];
	}[];
};

export type MusicBrainzClientOptions = {
	userAgent: string;
	minIntervalMs?: number;
	fetch?: typeof fetch;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function barcodeVariants(upc: string): string[] {
	const digits = upc.replace(/\D/g, "").replace(/^0+/, "");
	if (!digits) return [];
	return [...new Set([12, 13, 14].map((len) => digits.padStart(len, "0")))];
}

function toRelease(raw: RawRelease): MbRelease {
	return {
		id: raw.id,
		title: raw.title,
		date: raw.date || null,
		barcode: raw.barcode || null,
		status: raw.status ?? null,
		releaseGroupId: raw["release-group"]?.id ?? "",
		primaryType: raw["release-group"]?.["primary-type"] ?? null,
		secondaryTypes: raw["release-group"]?.["secondary-types"] ?? [],
		firstReleaseDate: raw["release-group"]?.["first-release-date"] || null,
		artistCredit: (raw["artist-credit"] ?? []).map((c) => ({
			name: c.name,
			artistId: c.artist.id,
		})),
		tracks: (raw.media ?? []).flatMap((medium) =>
			(medium.tracks ?? []).map((track) => ({
				position: track.position,
				discNumber: medium.position,
				title: track.title,
				lengthMs: track.length ?? null,
				recordingId: track.recording.id,
				isrcs: track.recording.isrcs ?? [],
			})),
		),
	};
}

export function createMusicBrainzClient(options: MusicBrainzClientOptions) {
	const minInterval = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
	const doFetch = options.fetch ?? fetch;
	let queue: Promise<unknown> = Promise.resolve();
	let lastRequestAt = 0;

	async function request<T>(path: string): Promise<T | null> {
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const wait = lastRequestAt + minInterval - Date.now();
			if (wait > 0) await sleep(wait);
			lastRequestAt = Date.now();
			const res = await doFetch(`${API}${path}`, {
				headers: {
					"user-agent": options.userAgent,
					accept: "application/json",
				},
			});
			if (res.status === 404) return null;
			if (res.status === 503 || res.status === 429) {
				await sleep(minInterval * 2 ** attempt);
				continue;
			}
			if (!res.ok) throw new Error(`musicbrainz ${path} ${res.status}`);
			return (await res.json()) as T;
		}
		throw new Error(
			`musicbrainz ${path} still rate limited after ${MAX_ATTEMPTS} attempts`,
		);
	}

	function serialized<T>(path: string): Promise<T | null> {
		const next = queue.then(() => request<T>(path));
		queue = next.catch(() => undefined);
		return next;
	}

	return {
		async recordingsByIsrc(isrc: string): Promise<MbRecording[]> {
			const data = await serialized<{
				recordings?: { id: string; title: string; length?: number | null }[];
			}>(`/isrc/${encodeURIComponent(isrc)}?fmt=json`);
			return (data?.recordings ?? []).map((r) => ({
				id: r.id,
				title: r.title,
				lengthMs: r.length ?? null,
			}));
		},

		async release(id: string): Promise<MbRelease | null> {
			const data = await serialized<RawRelease>(
				`/release/${id}?inc=recordings+isrcs+artist-credits+release-groups&fmt=json`,
			);
			return data ? toRelease(data) : null;
		},

		async releaseIdsByBarcode(upc: string): Promise<string[]> {
			const variants = barcodeVariants(upc);
			if (variants.length === 0) return [];
			const query = encodeURIComponent(`barcode:(${variants.join(" OR ")})`);
			const data = await serialized<{ releases?: { id: string }[] }>(
				`/release?query=${query}&fmt=json&limit=10`,
			);
			return (data?.releases ?? []).map((r) => r.id);
		},
	};
}

export type MusicBrainzClient = ReturnType<typeof createMusicBrainzClient>;
