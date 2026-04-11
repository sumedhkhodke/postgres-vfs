import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type DbClient } from "../src/db/client";
import { PostgresFs } from "../src/fs/postgres-fs";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_TENANT = "test-" + Date.now();

let sql: DbClient;
let fs: PostgresFs;

beforeAll(async () => {
  sql = createClient();
  // Run migration
  const schema = readFileSync(join(__dirname, "../src/db/schema.sql"), "utf-8");
  await sql.unsafe(schema);
  // Create fs
  fs = new PostgresFs(sql, TEST_TENANT);
  await fs.warmCache();
});

afterAll(async () => {
  // Clean up test data
  await sql`DELETE FROM vfs_files WHERE tenant_id = ${TEST_TENANT}`;
  await sql`DELETE FROM vfs_symlinks WHERE tenant_id = ${TEST_TENANT}`;
  await sql.end();
});

describe("PostgresFs", () => {
  test("root directory exists", async () => {
    const exists = await fs.exists("/");
    expect(exists).toBe(true);

    const stat = await fs.stat("/");
    expect(stat.isDirectory).toBe(true);
  });

  test("mkdir and readdir", async () => {
    await fs.mkdir("/testdir", { recursive: true });
    const exists = await fs.exists("/testdir");
    expect(exists).toBe(true);

    const stat = await fs.stat("/testdir");
    expect(stat.isDirectory).toBe(true);

    // Create nested dirs
    await fs.mkdir("/testdir/a/b/c", { recursive: true });
    const entries = await fs.readdir("/testdir");
    expect(entries).toContain("a");
  });

  test("writeFile and readFile", async () => {
    await fs.writeFile("/testdir/hello.txt", "Hello, World!");
    const content = await fs.readFile("/testdir/hello.txt");
    expect(content).toBe("Hello, World!");
  });

  test("writeFile auto-creates parent dirs", async () => {
    await fs.writeFile("/auto/nested/file.txt", "auto-created");
    const content = await fs.readFile("/auto/nested/file.txt");
    expect(content).toBe("auto-created");

    const parentExists = await fs.exists("/auto/nested");
    expect(parentExists).toBe(true);
  });

  test("appendFile", async () => {
    await fs.writeFile("/testdir/append.txt", "line1\n");
    await fs.appendFile("/testdir/append.txt", "line2\n");
    const content = await fs.readFile("/testdir/append.txt");
    expect(content).toBe("line1\nline2\n");
  });

  test("stat returns correct metadata", async () => {
    const stat = await fs.stat("/testdir/hello.txt");
    expect(stat.isFile).toBe(true);
    expect(stat.isDirectory).toBe(false);
    expect(stat.size).toBeGreaterThan(0);
    expect(stat.mtime).toBeInstanceOf(Date);
  });

  test("stat throws ENOENT for missing file", async () => {
    try {
      await fs.stat("/nonexistent");
      expect(true).toBe(false); // should not reach
    } catch (err: any) {
      expect(err.code).toBe("ENOENT");
    }
  });

  test("readFile throws ENOENT for missing file", async () => {
    try {
      await fs.readFile("/nonexistent");
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe("ENOENT");
    }
  });

  test("readFile throws EISDIR for directory", async () => {
    try {
      await fs.readFile("/testdir");
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe("EISDIR");
    }
  });

  test("rm file", async () => {
    await fs.writeFile("/testdir/todelete.txt", "bye");
    expect(await fs.exists("/testdir/todelete.txt")).toBe(true);
    await fs.rm("/testdir/todelete.txt");
    expect(await fs.exists("/testdir/todelete.txt")).toBe(false);
  });

  test("rm directory recursive", async () => {
    await fs.mkdir("/rmdir/a/b", { recursive: true });
    await fs.writeFile("/rmdir/a/b/file.txt", "content");
    await fs.rm("/rmdir", { recursive: true });
    expect(await fs.exists("/rmdir")).toBe(false);
    expect(await fs.exists("/rmdir/a/b/file.txt")).toBe(false);
  });

  test("cp file", async () => {
    await fs.writeFile("/testdir/original.txt", "original content");
    await fs.cp("/testdir/original.txt", "/testdir/copied.txt");
    const content = await fs.readFile("/testdir/copied.txt");
    expect(content).toBe("original content");
  });

  test("mv file", async () => {
    await fs.writeFile("/testdir/moveme.txt", "move content");
    await fs.mv("/testdir/moveme.txt", "/testdir/moved.txt");
    expect(await fs.exists("/testdir/moveme.txt")).toBe(false);
    const content = await fs.readFile("/testdir/moved.txt");
    expect(content).toBe("move content");
  });

  test("getAllPaths returns cached paths", async () => {
    await fs.warmCache(); // refresh cache
    const paths = fs.getAllPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain("/");
    expect(paths).toContain("/testdir/hello.txt");
  });

  test("resolvePath handles relative paths", () => {
    expect(fs.resolvePath("/a/b", "c.txt")).toBe("/a/b/c.txt");
    expect(fs.resolvePath("/a/b", "../c.txt")).toBe("/a/c.txt");
    expect(fs.resolvePath("/a/b", "/absolute")).toBe("/absolute");
    expect(fs.resolvePath("/a/b", "./relative")).toBe("/a/b/relative");
  });

  test("chmod updates mode", async () => {
    await fs.writeFile("/testdir/chmod.txt", "test");
    await fs.chmod("/testdir/chmod.txt", 0o100755);
    const stat = await fs.stat("/testdir/chmod.txt");
    expect(stat.mode).toBe(0o100755);
  });

  test("symlink and readlink", async () => {
    await fs.writeFile("/testdir/target.txt", "target content");
    await fs.symlink("/testdir/target.txt", "/testdir/link.txt");
    const target = await fs.readlink("/testdir/link.txt");
    expect(target).toBe("/testdir/target.txt");
  });

  test("readdirWithFileTypes returns typed entries", async () => {
    const entries = await fs.readdirWithFileTypes!("/testdir");
    expect(entries.length).toBeGreaterThan(0);

    const dir = entries.find((e) => e.name === "a");
    if (dir) {
      expect(dir.isDirectory).toBe(true);
      expect(dir.isFile).toBe(false);
    }

    const file = entries.find((e) => e.name === "hello.txt");
    if (file) {
      expect(file.isFile).toBe(true);
      expect(file.isDirectory).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // Hierarchy validation (ENOTDIR)
  // ---------------------------------------------------------------------------

  test("mkdir recursive throws ENOTDIR when ancestor is a file", async () => {
    await fs.writeFile("/hv-mkdirr/blocker", "I'm a file");
    try {
      await fs.mkdir("/hv-mkdirr/blocker/child/deep", { recursive: true });
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe("ENOTDIR");
    }
    await fs.rm("/hv-mkdirr", { recursive: true });
  });

  test("mkdir non-recursive throws ENOTDIR when parent is a file", async () => {
    await fs.writeFile("/hv-mkdir/fileparent", "data");
    try {
      await fs.mkdir("/hv-mkdir/fileparent/sub");
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe("ENOTDIR");
    }
    await fs.rm("/hv-mkdir", { recursive: true });
  });

  test("writeFile throws ENOTDIR when ancestor is a file", async () => {
    await fs.writeFile("/hv-wf/x", "I'm a file");
    try {
      await fs.writeFile("/hv-wf/x/y", "should fail");
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe("ENOTDIR");
    }
    await fs.rm("/hv-wf", { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // mv validation
  // ---------------------------------------------------------------------------

  test("mv throws ENOENT when source does not exist", async () => {
    await fs.mkdir("/hv-mv-dest", { recursive: true });
    try {
      await fs.mv("/hv-mv-ghost", "/hv-mv-dest/ghost");
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe("ENOENT");
    }
    await fs.rm("/hv-mv-dest", { recursive: true });
  });

  test("mv throws ENOENT for missing source before checking dest parent", async () => {
    try {
      await fs.mv("/hv-mv-nosrc", "/hv-mv-nodest/file");
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe("ENOENT");
      expect(err.message).toContain("/hv-mv-nosrc");
    }
  });

  test("mv throws ENOTDIR when dest parent is a file", async () => {
    await fs.writeFile("/hv-mv-src", "source");
    await fs.writeFile("/hv-mv-filedest", "I'm a file not a dir");
    try {
      await fs.mv("/hv-mv-src", "/hv-mv-filedest/target");
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe("ENOTDIR");
    }
    await fs.rm("/hv-mv-src", { force: true });
    await fs.rm("/hv-mv-filedest", { force: true });
  });

  test("mv works for symlink-only source", async () => {
    await fs.mkdir("/hv-mv-sym", { recursive: true });
    await fs.symlink("/some/target", "/hv-mv-sym/link");
    await fs.mv("/hv-mv-sym/link", "/hv-mv-sym/moved-link");
    const target = await fs.readlink("/hv-mv-sym/moved-link");
    expect(target).toBe("/some/target");
    expect(await fs.exists("/hv-mv-sym/link")).toBe(false);
    await fs.rm("/hv-mv-sym", { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // cp validation
  // ---------------------------------------------------------------------------

  test("cp recursive creates destination parent dirs", async () => {
    await fs.mkdir("/hv-cpsrc/sub", { recursive: true });
    await fs.writeFile("/hv-cpsrc/sub/file.txt", "content");
    await fs.cp("/hv-cpsrc", "/hv-cpdst/deep/nested", { recursive: true });

    expect(await fs.exists("/hv-cpdst")).toBe(true);
    expect(await fs.exists("/hv-cpdst/deep")).toBe(true);
    expect(await fs.exists("/hv-cpdst/deep/nested/sub/file.txt")).toBe(true);
    const content = await fs.readFile("/hv-cpdst/deep/nested/sub/file.txt");
    expect(content).toBe("content");
    await fs.rm("/hv-cpsrc", { recursive: true });
    await fs.rm("/hv-cpdst", { recursive: true });
  });

  test("cp recursive preserves symlinks", async () => {
    await fs.mkdir("/hv-cpsym/dir", { recursive: true });
    await fs.writeFile("/hv-cpsym/dir/real.txt", "hello");
    await fs.symlink("/hv-cpsym/dir/real.txt", "/hv-cpsym/dir/link.txt");

    await fs.cp("/hv-cpsym/dir", "/hv-cpsym/copy", { recursive: true });

    const target = await fs.readlink("/hv-cpsym/copy/link.txt");
    expect(target).toBe("/hv-cpsym/dir/real.txt");
    const content = await fs.readFile("/hv-cpsym/copy/real.txt");
    expect(content).toBe("hello");
    await fs.rm("/hv-cpsym", { recursive: true });
  });

  // ---------------------------------------------------------------------------

  test("tenant isolation", async () => {
    const otherTenant = "other-" + Date.now();
    const otherFs = new PostgresFs(sql, otherTenant);
    await otherFs.warmCache();

    await otherFs.writeFile("/secret.txt", "other tenant data");
    expect(await otherFs.exists("/secret.txt")).toBe(true);

    // Original tenant should not see it
    expect(await fs.exists("/secret.txt")).toBe(false);

    // Clean up
    await sql`DELETE FROM vfs_files WHERE tenant_id = ${otherTenant}`;
  });
});
