import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
	process.loadEnvFile(path.resolve(__dirname, "../../../.env"));
} catch {}

// drizzle-kit's migrate CLI hides driver errors behind its spinner, so call migrate() directly.
const connectionString = process.env.LYTERION_DATABASE_URL;
if (!connectionString) {
	console.error("LYTERION_DATABASE_URL is not set");
	process.exit(1);
}

const migrationsFolder =
	process.env.LYTERION_MIGRATIONS_DIR ??
	path.join(__dirname, "../src/migrations");

const pool = new pg.Pool({ connectionString });
try {
	await migrate(drizzle({ client: pool }), { migrationsFolder });
	console.info("Migrations applied successfully.");
} catch (err) {
	console.error("Migration failed:", err);
	process.exitCode = 1;
} finally {
	await pool.end();
}
