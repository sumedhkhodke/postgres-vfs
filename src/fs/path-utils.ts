/** Normalize a path: resolve '.', '..', collapse '//', ensure leading '/' */
export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return "/" + resolved.join("/");
}

export function parentDir(path: string): string {
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return "/";
  return path.slice(0, idx);
}

export function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return path.slice(idx + 1);
}

/** Get all ancestor directories for a path (excluding root), ordered shallowest-first */
export function ancestors(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const result: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    result.push("/" + parts.slice(0, i).join("/"));
  }
  return result;
}

/** Escape special characters in a LIKE pattern value */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}
