import { describe, test, expect } from "bun:test";
import { normalizePath, parentDir, basename, ancestors, escapeLike } from "../src/fs/path-utils";

describe("normalizePath", () => {
  test("returns / for empty string", () => {
    expect(normalizePath("")).toBe("/");
  });

  test("returns / for root", () => {
    expect(normalizePath("/")).toBe("/");
  });

  test("normalizes simple path", () => {
    expect(normalizePath("/a/b/c")).toBe("/a/b/c");
  });

  test("collapses double slashes", () => {
    expect(normalizePath("/a//b///c")).toBe("/a/b/c");
  });

  test("resolves dot segments", () => {
    expect(normalizePath("/a/./b")).toBe("/a/b");
  });

  test("resolves double-dot segments", () => {
    expect(normalizePath("/a/b/../c")).toBe("/a/c");
  });

  test("resolves double-dot past root", () => {
    expect(normalizePath("/a/../../b")).toBe("/b");
  });

  test("handles path with only dots", () => {
    expect(normalizePath("/..")).toBe("/");
  });

  test("adds leading slash to bare path", () => {
    expect(normalizePath("a/b")).toBe("/a/b");
  });

  test("handles trailing slash", () => {
    expect(normalizePath("/a/b/")).toBe("/a/b");
  });
});

describe("parentDir", () => {
  test("root returns root", () => {
    expect(parentDir("/")).toBe("/");
  });

  test("top-level file returns root", () => {
    expect(parentDir("/file.txt")).toBe("/");
  });

  test("nested path returns parent", () => {
    expect(parentDir("/a/b/c")).toBe("/a/b");
  });
});

describe("basename", () => {
  test("returns filename from path", () => {
    expect(basename("/a/b/file.txt")).toBe("file.txt");
  });

  test("returns name from root-level path", () => {
    expect(basename("/file.txt")).toBe("file.txt");
  });

  test("returns empty for root", () => {
    expect(basename("/")).toBe("");
  });
});

describe("ancestors", () => {
  test("returns empty for root-level path", () => {
    expect(ancestors("/file.txt")).toEqual([]);
  });

  test("returns single ancestor for two-level path", () => {
    expect(ancestors("/a/file.txt")).toEqual(["/a"]);
  });

  test("returns multiple ancestors shallowest-first", () => {
    expect(ancestors("/a/b/c/file.txt")).toEqual(["/a", "/a/b", "/a/b/c"]);
  });
});

describe("escapeLike", () => {
  test("escapes percent", () => {
    expect(escapeLike("a%b")).toBe("a\\%b");
  });

  test("escapes underscore", () => {
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  test("escapes backslash", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  test("passes normal text through", () => {
    expect(escapeLike("/projects/src")).toBe("/projects/src");
  });

  test("escapes multiple special chars", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
