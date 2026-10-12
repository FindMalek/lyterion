import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Service credentials entered in the dashboard (#83). payload is AES-256-GCM ciphertext, never plain JSON.
export const integrationCredential = pgTable("integration_credential", {
	kind: text("kind").primaryKey(),
	payload: text("payload").notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
