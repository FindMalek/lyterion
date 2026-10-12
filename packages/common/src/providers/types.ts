// Contract: docs/providers.md § Interface.

export type ProviderId =
	| "library"
	| "purchases"
	| "proxy"
	| "deezer"
	| "streamrip"
	| "slskd"
	| "anna"
	| "youtube"
	| "lidarr";

export type ProviderKind = "library" | "catalog" | "p2p" | "archive" | "video";

export type AudioFormat =
	| "flac"
	| "alac"
	| "wav"
	| "mp3"
	| "aac"
	| "opus"
	| "vorbis";

export type RecordingTarget = {
	recordingId: string;
	isrcs: string[];
	title: string;
	artists: string[];
	album: string | null;
	durationMs: number;
	spotifyTrackId: string | null;
};

export type Candidate = {
	providerId: ProviderId;
	ref: string;
	format: AudioFormat;
	bitrateKbps?: number;
	bitDepth?: number;
	sampleRateHz?: number;
	durationMs?: number;
	isrcMatch: boolean;
	matchConfidence: number;
	estimatedSeconds?: number;
};

export type FetchedFile = { path: string; candidate: Candidate };

export type ProviderHealth = {
	ok: boolean;
	latencyMs?: number;
	detail?: string;
};

export interface Provider {
	id: ProviderId;
	kind: ProviderKind;
	phase: "A" | "B" | "C" | "D";
	health(): Promise<ProviderHealth>;
	search(target: RecordingTarget): Promise<Candidate[]>;
	fetch(candidate: Candidate, stagingDir: string): Promise<FetchedFile>;
}
