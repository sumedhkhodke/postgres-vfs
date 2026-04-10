import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type DbClient } from "../src/db/client";
import { createPostgresSandbox } from "../src/bash-tool/adapter";
import { createPostgresVfsTool } from "../src/bash-tool/index";
import type { Sandbox } from "bash-tool";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_TENANT = "bash-tool-test-" + Date.now();

let sql: DbClient;

beforeAll(async () => {
  sql = createClient();
  const schema = readFileSync(join(__dirname, "../src/db/schema.sql"), "utf-8");
  await sql.unsafe(schema);
});

afterAll(async () => {
  await sql`DELETE FROM vfs_files WHERE tenant_id = ${TEST_TENANT}`;
  await sql`DELETE FROM vfs_symlinks WHERE tenant_id = ${TEST_TENANT}`;
  await sql.end();
});

describe("createPostgresSandbox", () => {
  let sandbox: Sandbox;

  beforeAll(async () => {
    sandbox = await createPostgresSandbox({ sql, tenantId: TEST_TENANT });
  });

  test("executeCommand runs bash commands", async () => {
    const result = await sandbox.executeCommand('echo "hello from sandbox"');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello from sandbox");
  });

  test("writeFiles creates files", async () => {
    await sandbox.writeFiles([
      { path: "/sandbox/file1.txt", content: "content one" },
      { path: "/sandbox/file2.txt", content: "content two" },
    ]);
    const content = await sandbox.readFile("/sandbox/file1.txt");
    expect(content).toBe("content one");
  });

  test("readFile reads files", async () => {
    const content = await sandbox.readFile("/sandbox/file2.txt");
    expect(content).toBe("content two");
  });

  test("executeCommand sees written files", async () => {
    const result = await sandbox.executeCommand("ls /sandbox");
    expect(result.stdout).toContain("file1.txt");
    expect(result.stdout).toContain("file2.txt");
  });

  test("executeCommand supports pipes", async () => {
    await sandbox.writeFiles([
      { path: "/data/names.txt", content: "charlie\nalice\nbob\n" },
    ]);
    const result = await sandbox.executeCommand("cat /data/names.txt | sort");
    const lines = result.stdout.trim().split("\n");
    expect(lines).toEqual(["alice", "bob", "charlie"]);
  });

  test("executeCommand supports grep", async () => {
    await sandbox.writeFiles([
      { path: "/src/app.ts", content: "// TODO: fix this\nconst x = 1;\n// TODO: refactor\n" },
    ]);
    const result = await sandbox.executeCommand("grep -n TODO /src/app.ts");
    expect(result.stdout).toContain("1:// TODO: fix this");
    expect(result.stdout).toContain("3:// TODO: refactor");
  });

  test("writeFiles handles Buffer content", async () => {
    await sandbox.writeFiles([
      { path: "/buf/test.txt", content: Buffer.from("buffer content") },
    ]);
    const content = await sandbox.readFile("/buf/test.txt");
    expect(content).toBe("buffer content");
  });

  test("readFile throws on missing file", async () => {
    try {
      await sandbox.readFile("/nonexistent.txt");
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });
});

describe("createPostgresVfsTool", () => {
  test("returns toolkit with bash, readFile, writeFile tools", async () => {
    const toolkit = await createPostgresVfsTool({
      sql,
      tenantId: TEST_TENANT + "-toolkit",
    });

    // Verify the toolkit has the expected shape
    expect(toolkit.tools).toBeDefined();
    expect(toolkit.tools.bash).toBeDefined();
    expect(toolkit.tools.readFile).toBeDefined();
    expect(toolkit.tools.writeFile).toBeDefined();
    expect(toolkit.sandbox).toBeDefined();

    // Verify sandbox works through the toolkit
    await toolkit.sandbox.writeFiles([
      { path: "/toolkit-test.txt", content: "toolkit works" },
    ]);
    const content = await toolkit.sandbox.readFile("/toolkit-test.txt");
    expect(content).toBe("toolkit works");

    // Cleanup
    await sql`DELETE FROM vfs_files WHERE tenant_id = ${TEST_TENANT + "-toolkit"}`;
  });
});
