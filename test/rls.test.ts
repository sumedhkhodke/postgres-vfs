import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type DbClient } from "../src/db/client.js";
import { withTenant } from "../src/db/tenant.js";
import { ftsSearch, fuzzySearch } from "../src/fs/search.js";
import { findByTag, recentFiles, updateEmbedding } from "../src/fs/metadata.js";
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
  await sql`INSERT INTO vfs_files (tenant_id, path, content, tags)
            VALUES (${A}, '/doc.txt', 'the quick brown fox', ARRAY['alpha'])`;
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
    ).rejects.toThrow(/violates row-level security policy/i);
  });

  test("unset tenant GUC denies all rows (fail closed)", async () => {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE vfs_app`;
      const rows = await tx`SELECT * FROM vfs_files`;
      expect(rows.length).toBe(0);
    });
  });
});

describe("withTenant helper", () => {
  test("runs the callback as vfs_app with the tenant GUC set", async () => {
    const rows = await withTenant(sql, A, (tx) =>
      tx`SELECT current_user AS role, current_setting('app.tenant_id', true) AS tenant`
    );
    expect(rows[0].role).toBe("vfs_app");
    expect(rows[0].tenant).toBe(A);
  });

  test("scopes reads to the tenant", async () => {
    const own = await withTenant(sql, A, (tx) => tx`SELECT tenant_id FROM vfs_files`);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((r) => r.tenant_id === A)).toBe(true);

    const cross = await withTenant(sql, A, (tx) => tx`SELECT * FROM vfs_files WHERE tenant_id = ${B}`);
    expect(cross.length).toBe(0);
  });

  test("role and GUC do not leak back to the pooled connection", async () => {
    await withTenant(sql, A, (tx) => tx`SELECT 1`);
    const after = await sql`SELECT current_user AS role, current_setting('app.tenant_id', true) AS tenant`;
    expect(after[0].role).not.toBe("vfs_app");
    // PostgreSQL reverts SET LOCAL custom GUCs to "" (not null) after commit on
    // the same session; toBeFalsy covers both "" and null — the security
    // property holds since "" won't match any real tenant_id.
    expect(after[0].tenant).toBeFalsy();
  });
});

describe("search + metadata run under RLS", () => {
  test("ftsSearch returns the tenant's matching file", async () => {
    const results = await ftsSearch(sql, A, "quick");
    expect(results.some((r) => r.path === "/doc.txt")).toBe(true);
  });

  test("fuzzySearch executes under vfs_app (trigram grants sufficient)", async () => {
    const results = await fuzzySearch(sql, A, "quick brown");
    expect(Array.isArray(results)).toBe(true);
  });

  test("findByTag returns the tenant's tagged path", async () => {
    const paths = await findByTag(sql, A, "alpha");
    expect(paths).toContain("/doc.txt");
  });

  test("recentFiles is scoped to the tenant", async () => {
    const files = await recentFiles(sql, A, 50);
    expect(files.every((f) => f.path !== "/b.txt")).toBe(true);
    expect(files.some((f) => f.path === "/doc.txt")).toBe(true);
  });

  test("updateEmbedding writes an embedding under RLS for the tenant", async () => {
    const vec = Array(1536).fill(0.1);
    await updateEmbedding(sql, A, "/doc.txt", vec);
    const rows = await withTenant(sql, A, (tx) =>
      tx`SELECT embedding IS NOT NULL AS has_emb FROM vfs_files WHERE path = '/doc.txt'`
    );
    expect(rows[0].has_emb).toBe(true);
  });
});
