import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type DbClient } from "../src/db/client";
import { createPostgresSandbox } from "../src/bash-tool/adapter";
import type { Sandbox } from "bash-tool";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_TENANT = "cmd-test-" + Date.now();

let sql: DbClient;
let sandbox: Sandbox;

beforeAll(async () => {
  sql = createClient();
  const schema = readFileSync(join(__dirname, "../src/db/schema.sql"), "utf-8");
  await sql.unsafe(schema);

  sandbox = await createPostgresSandbox({ sql, tenantId: TEST_TENANT });

  // Seed test files
  await sandbox.writeFiles([
    { path: "/docs/guide.md", content: "# Guide\nHow to use the API for authentication and setup." },
    { path: "/docs/faq.md", content: "# FAQ\nFrequently asked questions about deployment." },
    { path: "/src/server.ts", content: "// TODO: add rate limiting\nconst app = express();" },
  ]);
});

afterAll(async () => {
  await sql`DELETE FROM vfs_files WHERE tenant_id = ${TEST_TENANT}`;
  await sql`DELETE FROM vfs_symlinks WHERE tenant_id = ${TEST_TENANT}`;
  await sql.end();
});

describe("search command", () => {
  test("finds files by content", async () => {
    const result = await sandbox.executeCommand("search authentication");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("/docs/guide.md");
  });

  test("returns empty for no match", async () => {
    const result = await sandbox.executeCommand("search xyznonexistent");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  test("respects --limit", async () => {
    const result = await sandbox.executeCommand("search --limit 1 guide");
    expect(result.exitCode).toBe(0);
  });

  test("shows usage on empty args", async () => {
    const result = await sandbox.executeCommand("search");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage");
  });
});

describe("tag / untag / tags commands", () => {
  test("tag adds a tag", async () => {
    const result = await sandbox.executeCommand("tag /docs/guide.md important");
    expect(result.exitCode).toBe(0);
  });

  test("tags finds tagged files", async () => {
    const result = await sandbox.executeCommand("tags important");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("/docs/guide.md");
  });

  test("untag removes a tag", async () => {
    await sandbox.executeCommand("untag /docs/guide.md important");
    const result = await sandbox.executeCommand("tags important");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("/docs/guide.md");
  });

  test("tag shows usage on missing args", async () => {
    const result = await sandbox.executeCommand("tag /only-path");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage");
  });

  test("tags shows usage on missing args", async () => {
    const result = await sandbox.executeCommand("tags");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage");
  });
});

describe("recent command", () => {
  test("lists recently modified files", async () => {
    const result = await sandbox.executeCommand("recent 3");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("/docs/guide.md");
    expect(result.stdout).toContain("/src/server.ts");
  });

  test("defaults to 20 with no args", async () => {
    const result = await sandbox.executeCommand("recent");
    expect(result.exitCode).toBe(0);
  });
});

describe("summarize command", () => {
  test("sets a summary on a file", async () => {
    const result = await sandbox.executeCommand('summarize /docs/guide.md API usage guide');
    expect(result.exitCode).toBe(0);
  });

  test("summary appears in search results", async () => {
    const result = await sandbox.executeCommand("search API guide");
    expect(result.exitCode).toBe(0);
    // The summary should boost this file
    expect(result.stdout).toContain("/docs/guide.md");
  });

  test("shows usage on missing args", async () => {
    const result = await sandbox.executeCommand("summarize /only-path");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage");
  });
});
