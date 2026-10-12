import { env } from "@lyterion/env/server";
import { type Column, eq, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export { eq };

export const db = drizzle({
	client: new Pool({ connectionString: env.LYTERION_DATABASE_URL }),
	schema,
});

// Use in onConflictDoUpdate set blocks instead of inline sql`excluded.<col>` snippets.
export function conflictValue<T>(col: Column): SQL<T> {
	return sql<T>`excluded.${sql.identifier(col.name)}`;
}
