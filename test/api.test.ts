import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type DbClient } from "../src/db/client";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { handleApi } from "../src/ui/api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_TENANT = "api-test-" + Date.now();
const BASE = "http://localhost:4321";

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

function api(method: string, path: string, body?: unknown): Promise<Response> {
  const url = new URL(`${BASE}/api${path}`);
  url.searchParams.set("tenant", TEST_TENANT);
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return handleApi(new Request(url, init), url);
}

describe("API error handling", () => {
  test("GET /file for nonexistent path returns 404 with safe message", async () => {
    const res = await api("GET", "/file?path=/does-not-exist");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("File or directory not found.");
    expect(data.error).not.toContain("/does-not-exist");
  });

  test("DELETE /file for nonexistent path returns 404", async () => {
    const res = await api("DELETE", "/file?path=/does-not-exist");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("File or directory not found.");
  });

  test("GET /file on a directory returns 400 (EISDIR)", async () => {
    await api("POST", "/mkdir", { path: "/api-test-dir" });
    const res = await api("GET", "/file?path=/api-test-dir");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Path is a directory.");
  });

  test("error messages never contain internal VFS paths", async () => {
    const res = await api("GET", "/file?path=/secret/internal/path.txt");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).not.toContain("/secret");
    expect(data.error).not.toContain("path.txt");
  });

  test("unknown route returns 404", async () => {
    const res = await api("GET", "/nonexistent-route");
    expect(res.status).toBe(404);
  });
});

describe("API path normalization", () => {
  test("POST /file normalizes path in response", async () => {
    const res = await api("POST", "/file", { path: "//a//b/../c.txt", content: "hello" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.path).toBe("/a/c.txt");
  });

  test("DELETE /file normalizes path in response", async () => {
    await api("POST", "/file", { path: "/to-delete.txt", content: "bye" });
    const res = await api("DELETE", "/file?path=//to-delete.txt");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.path).toBe("/to-delete.txt");
  });

  test("POST /mkdir normalizes path in response", async () => {
    const res = await api("POST", "/mkdir", { path: "//norm-test//sub//" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.path).toBe("/norm-test/sub");
  });

  test("POST /rename normalizes both paths in response", async () => {
    await api("POST", "/file", { path: "/rename-src.txt", content: "data" });
    const res = await api("POST", "/rename", {
      oldPath: "//rename-src.txt",
      newPath: "//rename-dst.txt",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.oldPath).toBe("/rename-src.txt");
    expect(data.newPath).toBe("/rename-dst.txt");
  });
});
