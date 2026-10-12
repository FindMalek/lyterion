CREATE TABLE "navidrome_scan_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"pending" integer DEFAULT 0 NOT NULL,
	"last_placed_at" timestamp,
	"last_scan_at" timestamp
);
