CREATE TABLE "candidate" (
	"id" serial PRIMARY KEY NOT NULL,
	"recording_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"ref" text NOT NULL,
	"format" text NOT NULL,
	"bitrate_kbps" integer,
	"bit_depth" integer,
	"sample_rate_hz" integer,
	"duration_ms" integer,
	"isrc_match" boolean DEFAULT false NOT NULL,
	"match_confidence" double precision NOT NULL,
	"rank" integer NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_file" (
	"id" serial PRIMARY KEY NOT NULL,
	"recording_id" text,
	"release_id" text,
	"path" text NOT NULL,
	"owned" boolean NOT NULL,
	"codec" text NOT NULL,
	"bitrate_kbps" integer,
	"bit_depth" integer,
	"sample_rate_hz" integer,
	"duration_ms" integer NOT NULL,
	"acoustid_recording" text,
	"spectral_cutoff_hz" integer,
	"verified_lossless" boolean DEFAULT false NOT NULL,
	"size_bytes" integer,
	"source_provider" text,
	"source_ref" text,
	"upgrade_reason" text,
	"upgrade_priority" integer,
	"navidrome_song_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recording" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artists" text[] DEFAULT '{}' NOT NULL,
	"version_flags" text[] DEFAULT '{}' NOT NULL,
	"duration_ms" integer NOT NULL,
	"isrcs" text[] DEFAULT '{}' NOT NULL,
	"mb_recording_id" text,
	"preferred_spotify_track_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"placed_release_ids" text[] DEFAULT '{}' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recording_member" (
	"spotify_track_id" text PRIMARY KEY NOT NULL,
	"recording_id" text NOT NULL,
	"edge" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release" (
	"id" text PRIMARY KEY NOT NULL,
	"spotify_album_id" text,
	"mb_release_id" text,
	"title" text NOT NULL,
	"album_artist" text NOT NULL,
	"type" text NOT NULL,
	"release_date" text,
	"is_saved" boolean DEFAULT false NOT NULL,
	"cover_url" text,
	"total_tracks" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_track" (
	"release_id" text NOT NULL,
	"recording_id" text NOT NULL,
	"disc_number" integer DEFAULT 1 NOT NULL,
	"track_number" integer,
	CONSTRAINT "release_track_release_id_recording_id_pk" PRIMARY KEY("release_id","recording_id")
);
--> statement-breakpoint
CREATE TABLE "review_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"recording_id" text NOT NULL,
	"reason" text NOT NULL,
	"candidate_ids" integer[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolution" text
);
--> statement-breakpoint
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_recording_id_recording_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recording"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_file" ADD CONSTRAINT "library_file_recording_id_recording_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recording"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_member" ADD CONSTRAINT "recording_member_recording_id_recording_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recording"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_track" ADD CONSTRAINT "release_track_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_track" ADD CONSTRAINT "release_track_recording_id_recording_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recording"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_recording_id_recording_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recording"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_recording_ref_idx" ON "candidate" USING btree ("recording_id","provider_id","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "library_file_path_idx" ON "library_file" USING btree ("path");--> statement-breakpoint
CREATE INDEX "library_file_recording_idx" ON "library_file" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX "recording_status_idx" ON "recording" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recording_member_recording_idx" ON "recording_member" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX "review_item_open_idx" ON "review_item" USING btree ("resolved_at");