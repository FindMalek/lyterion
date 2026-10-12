CREATE TABLE "integration_credential" (
	"kind" text PRIMARY KEY NOT NULL,
	"payload" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
