CREATE TABLE "data_import" (
	"id" serial PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"summary" jsonb,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
