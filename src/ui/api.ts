import { createClient } from "../db/client.js";
import { PostgresFs } from "../fs/postgres-fs.js";
import { hybridSearch } from "../fs/search.js";
import { recentFiles, addTag, removeTag } from "../fs/metadata.js";
import { errorMessage } from "../utils.js";
import { embedFile, generateEmbedding } from "../fs/embeddings.js";
import { normalizePath } from "../fs/path-utils.js";

const sql = createClient();

// Cache PostgresFs instances per tenant
const fsCache = new Map<string, PostgresFs>();

async function getFs(tenantId: string): Promise<PostgresFs> {
  let fs = fsCache.get(tenantId);
  if (!fs) {
    fs = new PostgresFs(sql, tenantId);
    await fs.warmCache();
    fsCache.set(tenantId, fs);
  }
  return fs;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

const FS_ERROR_STATUS: Record<string, number> = {
  ENOENT: 404,
  EEXIST: 409,
  EISDIR: 400,
  ENOTDIR: 400,
  ENOTEMPTY: 400,
  EINVAL: 400,
  EACCES: 403,
};

function resolveTenant(queryTenant: string, bodyTenant?: string): string {
  return bodyTenant ?? queryTenant;
}

export async function handleApi(req: Request, url: URL): Promise<Response> {
  const route = url.pathname.replace("/api", "");
  const tenant = url.searchParams.get("tenant") ?? "default";

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    if (route === "/tenants" && req.method === "GET") {
      const rows = await sql`SELECT DISTINCT tenant_id FROM vfs_files ORDER BY tenant_id`;
      return json(rows.map((r) => r.tenant_id));
    }

    if (route === "/files" && req.method === "GET") {
      const path = url.searchParams.get("path") ?? "/";
      const fs = await getFs(tenant);
      const entries = await fs.readdirWithFileTypes(path);
      const detailed = [];
      for (const entry of entries) {
        const fullPath = (path === "/" ? "/" : path + "/") + entry.name;
        try {
          const st = await fs.stat(fullPath);
          detailed.push({ name: entry.name, path: fullPath, isDir: entry.isDirectory, isSymlink: entry.isSymbolicLink, size: st.size, mtime: st.mtime.toISOString() });
        } catch {
          detailed.push({ name: entry.name, path: fullPath, isDir: entry.isDirectory, isSymlink: entry.isSymbolicLink, size: 0, mtime: null });
        }
      }
      return json(detailed);
    }

    if (route === "/file" && req.method === "GET") {
      const path = url.searchParams.get("path");
      if (!path) return err("path required");
      const fs = await getFs(tenant);
      const content = await fs.readFile(path);
      const st = await fs.stat(path);
      const meta = await sql`SELECT tags, summary FROM vfs_files WHERE tenant_id = ${tenant} AND path = ${path}`;
      return json({ path, content, size: st.size, mode: st.mode, mtime: st.mtime.toISOString(), tags: meta[0]?.tags ?? [], summary: meta[0]?.summary ?? null });
    }

    if (route === "/file" && (req.method === "POST" || req.method === "PUT")) {
      const body = (await req.json()) as { tenant?: string; path?: string; content?: string };
      const t = resolveTenant(tenant, body.tenant);
      if (!body.path) return err("path required");
      const fs = await getFs(t);
      const content = body.content ?? "";
      const normalized = normalizePath(body.path);
      await fs.writeFile(normalized, content);
      fsCache.delete(t);
      embedFile(sql, t, normalized, content).catch(() => {});
      return json({ ok: true, path: normalized });
    }

    if (route === "/file" && req.method === "DELETE") {
      const path = url.searchParams.get("path");
      if (!path) return err("path required");
      const fs = await getFs(tenant);
      const st = await fs.stat(path);
      await fs.rm(path, { recursive: st.isDirectory, force: true });
      fsCache.delete(tenant);
      return json({ ok: true, path: normalizePath(path) });
    }

    if (route === "/mkdir" && req.method === "POST") {
      const body = (await req.json()) as { tenant?: string; path?: string };
      const t = resolveTenant(tenant, body.tenant);
      if (!body.path) return err("path required");
      const fs = await getFs(t);
      await fs.mkdir(body.path, { recursive: true });
      fsCache.delete(t);
      return json({ ok: true, path: normalizePath(body.path) });
    }

    if (route === "/rename" && req.method === "POST") {
      const body = (await req.json()) as { tenant?: string; oldPath?: string; newPath?: string };
      const t = resolveTenant(tenant, body.tenant);
      if (!body.oldPath || !body.newPath) return err("oldPath and newPath required");
      const fs = await getFs(t);
      await fs.mv(body.oldPath, body.newPath);
      fsCache.delete(t);
      return json({ ok: true, oldPath: normalizePath(body.oldPath), newPath: normalizePath(body.newPath) });
    }

    if (route === "/search" && req.method === "GET") {
      const q = url.searchParams.get("q");
      if (!q) return err("q required");
      const embedding = await generateEmbedding(q);
      const results = await hybridSearch(sql, tenant, q, { limit: 30, embedding: embedding ?? undefined });
      return json(results);
    }

    if (route === "/recent" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
      const files = await recentFiles(sql, tenant, limit);
      return json(files);
    }

    if (route === "/tag" && req.method === "POST") {
      const body = (await req.json()) as { tenant?: string; path?: string; tag?: string; action?: string };
      const t = resolveTenant(tenant, body.tenant);
      if (!body.path || !body.tag) return err("path and tag required");
      if (body.action === "remove") {
        await removeTag(sql, t, body.path, body.tag);
      } else {
        await addTag(sql, t, body.path, body.tag);
      }
      return json({ ok: true });
    }

    if (route === "/stats" && req.method === "GET") {
      const rows = await sql`
        SELECT
          count(*) FILTER (WHERE NOT is_dir) AS file_count,
          count(*) FILTER (WHERE is_dir) AS dir_count,
          coalesce(sum(size), 0) AS total_size
        FROM vfs_files WHERE tenant_id = ${tenant}
      `;
      return json({ files: Number(rows[0].file_count), dirs: Number(rows[0].dir_count), totalSize: Number(rows[0].total_size) });
    }

    return err("Not found", 404);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const status = (code ? FS_ERROR_STATUS[code] : undefined) ?? 500;
    if (status === 500) {
      console.error("[api]", errorMessage(e));
      return err("Something went wrong. Please try again later.", 500);
    }
    return err(errorMessage(e), status);
  }
}
