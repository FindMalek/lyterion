ALTER TABLE "library_file" ADD COLUMN "upgrade_signal" text;--> statement-breakpoint
ALTER TABLE "library_file" ADD COLUMN "upgrade_notified_at" timestamp;