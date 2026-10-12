CREATE TABLE "playlist_write" (
	"name" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"entries" integer NOT NULL,
	"missing" integer NOT NULL,
	"written_at" timestamp NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"latency_ms" integer,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "recording_override" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"track_a" text NOT NULL,
	"track_b" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "provider_health_provider_idx" ON "provider_health" USING btree ("provider_id","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recording_override_pair_idx" ON "recording_override" USING btree ("kind","track_a","track_b");