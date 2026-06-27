import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type DbClient } from "../src/db/client.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A = "rls-a-" + Date.now();
const B = "rls-b-" + Date.now();

let sql: DbClient;

beforeAll(async () => {
  sql = createClient();
  const schema = readFileSync(join(__dirname, "../src/db/schema.sql"), "utf-8");
  await sql.unsafe(schema);
  // Seed as owner (bypasses RLS) so both tenants have rows to (not) see.
  await sql`INSERT INTO vfs_files (tenant_id, path, content) VALUES (${A}, '/a.txt', 'A data')`;
  await sql`INSERT INTO vfs_files (tenant_id, path, content) VALUES (${B}, '/b.txt', 'B data')`;
  await sql`INSERT INTO vfs_symlinks (tenant_id, path, target) VALUES (${A}, '/la', '/a.txt')`;
  await sql`INSERT INTO vfs_symlinks (tenant_id, path, target) VALUES (${B}, '/lb', '/b.txt')`;
});

afterAll(async () => {
  await sql`DELETE FROM vfs_files WHERE tenant_id IN (${A}, ${B})`;
  await sql`DELETE FROM vfs_symlinks WHERE tenant_id IN (${A}, ${B})`;
  await sql.end();
});

describe("Row-Level Security (database-level enforcement)", () => {
  test("a tenant-A session cannot SELECT tenant-B rows, even with an explicit predicate", async () => {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE vfs_app`;
      await tx`SELECT set_config('app.tenant_id', ${A}, true)`;

      const crossFiles = await tx`SELECT * FROM vfs_files WHERE tenant_id = ${B}`;
      expect(crossFiles.length).toBe(0);

      const crossSym = await tx`SELECT * FROM vfs_symlinks WHERE tenant_id = ${B}`;
      expect(crossSym.length).toBe(0);

      const allFiles = await tx`SELECT tenant_id FROM vfs_files`;
      expect(allFiles.length).toBeGreaterThan(0);
      expect(allFiles.every((r) => r.tenant_id === A)).toBe(true);
    });
  });

  test("WITH CHECK blocks inserting a row for another tenant", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE vfs_app`;
        await tx`SELECT set_config('app.tenant_id', ${A}, true)`;
        await tx`INSERT INTO vfs_files (tenant_id, path, content) VALUES (${B}, '/evil.txt', 'x')`;
      })
    ).rejects.toThrow();
  });

  test("unset tenant GUC denies all rows (fail closed)", async () => {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE vfs_app`;
      const rows = await tx`SELECT * FROM vfs_files`;
      expect(rows.length).toBe(0);
    });
  });
});
