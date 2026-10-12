import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { migrationRun } from "./run";

// Raw Spotify side, docs/data-model.md § Spotify side.
export const spotifyArtist = pgTable("spotify_artist", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	genres: text("genres").array().notNull().default([]),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const spotifyAlbum = pgTable("spotify_album", {
	id: text("id").primaryKey(),
	upc: text("upc"),
	title: text("title").notNull(),
	artists: text("artists").array().notNull().default([]),
	artistIds: text("artist_ids").array().notNull().default([]),
	releaseDate: text("release_date"),
	releaseDatePrecision: text("release_date_precision"),
	albumType: text("album_type"),
	totalTracks: integer("total_tracks"),
	imageUrl: text("image_url"),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const spotifyTrack = pgTable(
	"spotify_track",
	{
		id: text("id").primaryKey(),
		isrc: text("isrc"),
		title: text("title").notNull(),
		artists: text("artists").array().notNull().default([]),
		artistIds: text("artist_ids").array().notNull().default([]),
		albumId: text("album_id"),
		discNumber: integer("disc_number"),
		trackNumber: integer("track_number"),
		durationMs: integer("duration_ms").notNull(),
		explicit: boolean("explicit").notNull().default(false),
		popularity: integer("popularity"),
		linkedFromId: text("linked_from_id"),
		isLocal: boolean("is_local").notNull().default(false),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("spotify_track_isrc_idx").on(table.isrc),
		index("spotify_track_album_idx").on(table.albumId),
	],
);

export const spotifyPlaylist = pgTable("spotify_playlist", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description"),
	ownerId: text("owner_id"),
	snapshotId: text("snapshot_id"),
	imageUrl: text("image_url"),
	isCollaborative: boolean("is_collaborative").notNull().default(false),
	itemsUnavailable: boolean("items_unavailable").notNull().default(false),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const playlistEntry = pgTable(
	"playlist_entry",
	{
		playlistId: text("playlist_id")
			.notNull()
			.references(() => spotifyPlaylist.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		spotifyTrackId: text("spotify_track_id"),
		localName: text("local_name"),
		localArtist: text("local_artist"),
		localDurationMs: integer("local_duration_ms"),
		addedAt: timestamp("added_at"),
	},
	(table) => [primaryKey({ columns: [table.playlistId, table.position] })],
);

export const librarySave = pgTable(
	"library_save",
	{
		kind: text("kind")
			.$type<"liked_track" | "saved_album" | "followed_artist">()
			.notNull(),
		spotifyId: text("spotify_id").notNull(),
		addedAt: timestamp("added_at"),
		removedAt: timestamp("removed_at"),
	},
	(table) => [primaryKey({ columns: [table.kind, table.spotifyId] })],
);

export const exportPage = pgTable(
	"export_page",
	{
		id: serial("id").primaryKey(),
		runId: integer("run_id").references(() => migrationRun.id, {
			onDelete: "cascade",
		}),
		endpoint: text("endpoint").notNull(),
		body: jsonb("body").notNull(),
		fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
	},
	(table) => [index("export_page_run_idx").on(table.runId)],
);

export const exportCursor = pgTable(
	"export_cursor",
	{
		key: text("key").notNull(),
		value: text("value").notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [uniqueIndex("export_cursor_key_idx").on(table.key)],
);

// Spotify "Download your data" uploads (#12): parsed in the browser, processed by spotify.import.
export const dataImport = pgTable("data_import", {
	id: serial("id").primaryKey(),
	payload: jsonb("payload").notNull(),
	status: text("status")
		.$type<"queued" | "done" | "failed">()
		.notNull()
		.default("queued"),
	summary: jsonb("summary").$type<Record<string, unknown>>(),
	uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
