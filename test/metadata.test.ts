import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type DbClient } from "../src/db/client";
import { PostgresFs } from "../src/fs/postgres-fs";
import { addTag, removeTag, updateSummary, updateEmbedding } from "../src/fs/metadata";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_TENANT = "meta-test-" + Date.now();

let sql: DbClient;
let fs: PostgresFs;

beforeAll(async () => {
  sql = createClient();
  const schema = readFileSync(join(__dirname, "../src/db/schema.sql"), "utf-8");
  await sql.unsafe(schema);
  fs = new PostgresFs(sql, TEST_TENANT);
  // Seed files under their canonical keys (writeFile normalizes on insert).
  await fs.writeFile("/m/a.txt", "alpha");
  await fs.writeFile("/m/b.txt", "beta");
  await fs.writeFile("/m/c.txt", "gamma");
  await fs.writeFile("/m/d.txt", "delta");
});

afterAll(async () => {
  await sql`DELETE FROM vfs_files WHERE tenant_id = ${TEST_TENANT}`;
  await sql.end();
});

// The metadata helpers query `WHERE path = ${path}` directly. The stored key is
// always canonical, so a non-canonical path must be normalized before the query
// or it silently matches zero rows.
describe("metadata helpers normalize paths", () => {
  test("addTag applies the tag to the canonical row for a non-canonical path", async () => {
    await addTag(sql, TEST_TENANT, "//m/./a.txt", "tag1");
    const rows = await sql`SELECT tags FROM vfs_files WHERE tenant_id = ${TEST_TENANT} AND path = '/m/a.txt'`;
    expect(rows[0].tags).toContain("tag1");
  });

  test("removeTag removes the tag from the canonical row for a non-canonical path", async () => {
    await addTag(sql, TEST_TENANT, "/m/b.txt", "tag2");
    await removeTag(sql, TEST_TENANT, "/m/sub/../b.txt", "tag2");
    const rows = await sql`SELECT tags FROM vfs_files WHERE tenant_id = ${TEST_TENANT} AND path = '/m/b.txt'`;
    expect(rows[0].tags).not.toContain("tag2");
  });

  test("updateSummary sets the summary on the canonical row for a non-canonical path", async () => {
    await updateSummary(sql, TEST_TENANT, "//m/c.txt", "a summary");
    const rows = await sql`SELECT summary FROM vfs_files WHERE tenant_id = ${TEST_TENANT} AND path = '/m/c.txt'`;
    expect(rows[0].summary).toBe("a summary");
  });

  test("updateEmbedding sets the embedding on the canonical row for a non-canonical path", async () => {
    const vec = Array(1536).fill(0.05);
    await updateEmbedding(sql, TEST_TENANT, "/m/./d.txt", vec);
    const rows = await sql`SELECT embedding FROM vfs_files WHERE tenant_id = ${TEST_TENANT} AND path = '/m/d.txt'`;
    expect(rows[0].embedding).not.toBeNull();
  });
});
