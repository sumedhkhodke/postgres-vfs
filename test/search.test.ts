import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type DbClient } from "../src/db/client";
import { PostgresFs } from "../src/fs/postgres-fs";
import { grepFiles } from "../src/fs/search";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_TENANT = "search-test-" + Date.now();

let sql: DbClient;
let fs: PostgresFs;

beforeAll(async () => {
  sql = createClient();
  const schema = readFileSync(join(__dirname, "../src/db/schema.sql"), "utf-8");
  await sql.unsafe(schema);
  fs = new PostgresFs(sql, TEST_TENANT);
  await fs.writeFile("/g/x.txt", "the needle is here");
});

afterAll(async () => {
  await sql`DELETE FROM vfs_files WHERE tenant_id = ${TEST_TENANT}`;
  await sql.end();
});

describe("grepFiles normalizes options.paths", () => {
  test("matches the canonical row when given a non-canonical path filter", async () => {
    const results = await grepFiles(sql, TEST_TENANT, "needle", { paths: ["//g/./x.txt"] });
    expect(results.map((r) => r.path)).toContain("/g/x.txt");
  });
});
