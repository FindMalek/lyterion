CREATE TABLE "export_cursor" (
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_page" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"endpoint" text NOT NULL,
	"body" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_save" (
	"kind" text NOT NULL,
	"spotify_id" text NOT NULL,
	"added_at" timestamp,
	"removed_at" timestamp,
	CONSTRAINT "library_save_kind_spotify_id_pk" PRIMARY KEY("kind","spotify_id")
);
--> statement-breakpoint
CREATE TABLE "playlist_entry" (
	"playlist_id" text NOT NULL,
	"position" integer NOT NULL,
	"spotify_track_id" text,
	"local_name" text,
	"local_artist" text,
	"local_duration_ms" integer,
	"added_at" timestamp,
	CONSTRAINT "playlist_entry_playlist_id_position_pk" PRIMARY KEY("playlist_id","position")
);
--> statement-breakpoint
CREATE TABLE "spotify_album" (
	"id" text PRIMARY KEY NOT NULL,
	"upc" text,
	"title" text NOT NULL,
	"artists" text[] DEFAULT '{}' NOT NULL,
	"artist_ids" text[] DEFAULT '{}' NOT NULL,
	"release_date" text,
	"release_date_precision" text,
	"album_type" text,
	"total_tracks" integer,
	"image_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_artist" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"genres" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_playlist" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_id" text,
	"snapshot_id" text,
	"image_url" text,
	"is_collaborative" boolean DEFAULT false NOT NULL,
	"items_unavailable" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_track" (
	"id" text PRIMARY KEY NOT NULL,
	"isrc" text,
	"title" text NOT NULL,
	"artists" text[] DEFAULT '{}' NOT NULL,
	"artist_ids" text[] DEFAULT '{}' NOT NULL,
	"album_id" text,
	"disc_number" integer,
	"track_number" integer,
	"duration_ms" integer NOT NULL,
	"explicit" boolean DEFAULT false NOT NULL,
	"popularity" integer,
	"linked_from_id" text,
	"is_local" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "export_page" ADD CONSTRAINT "export_page_run_id_migration_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."migration_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_entry" ADD CONSTRAINT "playlist_entry_playlist_id_spotify_playlist_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."spotify_playlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "export_cursor_key_idx" ON "export_cursor" USING btree ("key");--> statement-breakpoint
CREATE INDEX "export_page_run_idx" ON "export_page" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "spotify_track_isrc_idx" ON "spotify_track" USING btree ("isrc");--> statement-breakpoint
CREATE INDEX "spotify_track_album_idx" ON "spotify_track" USING btree ("album_id");