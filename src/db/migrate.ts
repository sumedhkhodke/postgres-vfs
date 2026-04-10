import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL ?? "postgres://localhost:5432/postgres_vfs";
  const sql = postgres(databaseUrl);

  console.log(`Migrating database: ${databaseUrl}`);

  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");

  try {
    await sql.unsafe(schema);
    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
