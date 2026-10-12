import {
	boolean,
	doublePrecision,
	index,
	integer,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// Identity and acquisition, docs/data-model.md § Identity and § Acquisition.
export type RecordingStatus =
	| "pending"
	| "resolved"
	| "searching"
	| "fetching"
	| "verifying"
	| "placed"
	| "linked"
	| "missing"
	| "review"
	| "skipped"
	| "existing";

export const recording = pgTable(
	"recording",
	{
		id: text("id").primaryKey(),
		title: text("title").notNull(),
		artists: text("artists").array().notNull().default([]),
		versionFlags: text("version_flags").array().notNull().default([]),
		durationMs: integer("duration_ms").notNull(),
		isrcs: text("isrcs").array().notNull().default([]),
		mbRecordingId: text("mb_recording_id"),
		preferredSpotifyTrackId: text("preferred_spotify_track_id").notNull(),
		status: text("status")
			.$type<RecordingStatus>()
			.notNull()
			.default("pending"),
		placedReleaseIds: text("placed_release_ids").array().notNull().default([]),
		generation: integer("generation").notNull().default(0),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [index("recording_status_idx").on(table.status)],
);

export const recordingMember = pgTable(
	"recording_member",
	{
		spotifyTrackId: text("spotify_track_id").primaryKey(),
		recordingId: text("recording_id")
			.notNull()
			.references(() => recording.id, { onDelete: "cascade" }),
		edge: text("edge")
			.$type<"self" | "isrc" | "mb" | "fuzzy" | "fingerprint" | "manual">()
			.notNull(),
	},
	(table) => [index("recording_member_recording_idx").on(table.recordingId)],
);

export const release = pgTable("release", {
	id: text("id").primaryKey(),
	spotifyAlbumId: text("spotify_album_id"),
	mbReleaseId: text("mb_release_id"),
	title: text("title").notNull(),
	albumArtist: text("album_artist").notNull(),
	type: text("type")
		.$type<"album" | "ep" | "single" | "compilation">()
		.notNull(),
	releaseDate: text("release_date"),
	isSaved: boolean("is_saved").notNull().default(false),
	coverUrl: text("cover_url"),
	totalTracks: integer("total_tracks"),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const releaseTrack = pgTable(
	"release_track",
	{
		releaseId: text("release_id")
			.notNull()
			.references(() => release.id, { onDelete: "cascade" }),
		recordingId: text("recording_id")
			.notNull()
			.references(() => recording.id, { onDelete: "cascade" }),
		discNumber: integer("disc_number").notNull().default(1),
		trackNumber: integer("track_number"),
	},
	(table) => [primaryKey({ columns: [table.releaseId, table.recordingId] })],
);

export const candidate = pgTable(
	"candidate",
	{
		id: serial("id").primaryKey(),
		recordingId: text("recording_id")
			.notNull()
			.references(() => recording.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		ref: text("ref").notNull(),
		format: text("format").notNull(),
		bitrateKbps: integer("bitrate_kbps"),
		bitDepth: integer("bit_depth"),
		sampleRateHz: integer("sample_rate_hz"),
		durationMs: integer("duration_ms"),
		isrcMatch: boolean("isrc_match").notNull().default(false),
		matchConfidence: doublePrecision("match_confidence").notNull(),
		rank: integer("rank").notNull(),
		state: text("state")
			.$type<"new" | "fetching" | "failed" | "chosen">()
			.notNull()
			.default("new"),
		failureReason: text("failure_reason"),
		// A near miss kept for the review queue's audio preview (#34).
		stagedPath: text("staged_path"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("candidate_recording_ref_idx").on(
			table.recordingId,
			table.providerId,
			table.ref,
		),
	],
);

export const libraryFile = pgTable(
	"library_file",
	{
		id: serial("id").primaryKey(),
		recordingId: text("recording_id").references(() => recording.id, {
			onDelete: "set null",
		}),
		releaseId: text("release_id"),
		path: text("path").notNull(),
		owned: boolean("owned").notNull(),
		codec: text("codec").notNull(),
		bitrateKbps: integer("bitrate_kbps"),
		bitDepth: integer("bit_depth"),
		sampleRateHz: integer("sample_rate_hz"),
		durationMs: integer("duration_ms").notNull(),
		acoustidRecording: text("acoustid_recording"),
		spectralCutoffHz: integer("spectral_cutoff_hz"),
		verifiedLossless: boolean("verified_lossless").notNull().default(false),
		sizeBytes: integer("size_bytes"),
		sourceProvider: text("source_provider"),
		sourceRef: text("source_ref"),
		upgradeReason: text("upgrade_reason"),
		upgradePriority: integer("upgrade_priority"),
		// Which owner signal flagged it (D-032), so the right one is cleared after the swap.
		upgradeSignal: text("upgrade_signal").$type<"rating" | "playlist">(),
		upgradeNotifiedAt: timestamp("upgrade_notified_at"),
		navidromeSongId: text("navidrome_song_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("library_file_path_idx").on(table.path),
		index("library_file_recording_idx").on(table.recordingId),
	],
);

export const reviewItem = pgTable(
	"review_item",
	{
		id: serial("id").primaryKey(),
		recordingId: text("recording_id")
			.notNull()
			.references(() => recording.id, { onDelete: "cascade" }),
		reason: text("reason").notNull(),
		candidateIds: integer("candidate_ids").array().notNull().default([]),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		resolvedAt: timestamp("resolved_at"),
		resolution: text("resolution"),
	},
	(table) => [index("review_item_open_idx").on(table.resolvedAt)],
);

// One row (id 1): files placed since the last scan, for the debounced Navidrome scan (docs/library.md).
export const navidromeScanState = pgTable("navidrome_scan_state", {
	id: integer("id").primaryKey().default(1),
	pending: integer("pending").notNull().default(0),
	lastPlacedAt: timestamp("last_placed_at"),
	lastScanAt: timestamp("last_scan_at"),
});

// Owner decisions on grouping (#19): applied after the computed edges on the next identity.resolve.
export const recordingOverride = pgTable(
	"recording_override",
	{
		id: serial("id").primaryKey(),
		kind: text("kind").$type<"merge" | "split">().notNull(),
		trackA: text("track_a").notNull(),
		trackB: text("track_b").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("recording_override_pair_idx").on(
			table.kind,
			table.trackA,
			table.trackB,
		),
	],
);

export const playlistWrite = pgTable("playlist_write", {
	name: text("name").primaryKey(),
	path: text("path").notNull(),
	entries: integer("entries").notNull(),
	missing: integer("missing").notNull(),
	writtenAt: timestamp("written_at").notNull(),
	checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

export const providerHealth = pgTable(
	"provider_health",
	{
		id: serial("id").primaryKey(),
		providerId: text("provider_id").notNull(),
		checkedAt: timestamp("checked_at").defaultNow().notNull(),
		ok: boolean("ok").notNull(),
		latencyMs: integer("latency_ms"),
		detail: text("detail"),
	},
	(table) => [
		index("provider_health_provider_idx").on(table.providerId, table.checkedAt),
	],
);

// Next free start time per provider key, shared by every acquire task so pacing holds across workers (#25).
export const providerSlot = pgTable("provider_slot", {
	key: text("key").primaryKey(),
	nextAt: timestamp("next_at").notNull(),
});
