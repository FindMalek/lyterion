import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

// drizzle-kit's own `migrate` CLI hides the driver error behind its spinner,
// so call drizzle-orm's migrate() directly and print the real failure.
async function main() {
	const connectionString = process.env.LYTERION_DATABASE_URL;
	if (!connectionString) {
		throw new Error("LYTERION_DATABASE_URL is not set");
	}

	const migrationsFolder = path.join(__dirname, "../src/migrations");

	const { Pool } = await import("pg");
	const { drizzle } = await import("drizzle-orm/node-postgres");
	const { migrate } = await import("drizzle-orm/node-postgres/migrator");
	const pool = new Pool({ connectionString });
	const db = drizzle({ client: pool });
	await migrate(db, { migrationsFolder });
	await pool.end();
}

main()
	.then(() => {
		console.info("Migrations applied successfully.");
	})
	.catch((err) => {
		console.error("Migration failed:", err);
		process.exit(1);
	});
