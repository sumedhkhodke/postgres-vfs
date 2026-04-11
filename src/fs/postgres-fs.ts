import type {
  IFileSystem,
  FsStat,
  FileContent,
  BufferEncoding,
} from "just-bash";
import type { DbClient } from "../db/client.js";
import { normalizePath, parentDir, basename, ancestors, escapeLike } from "./path-utils.js";

export interface DirentEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

interface MkdirOptions {
  recursive?: boolean;
}
interface RmOptions {
  recursive?: boolean;
  force?: boolean;
}
interface CpOptions {
  recursive?: boolean;
}
interface ReadFileOptions {
  encoding?: BufferEncoding | null;
}
interface WriteFileOptions {
  encoding?: BufferEncoding;
}

// Unix mode constants (decimal equivalents of octal)
const MODE_FILE = 0o100644; // 33188 — regular file rw-r--r--
const MODE_DIR = 0o40755;  // 16877 — directory rwxr-xr-x
const MODE_SYMLINK = 0o120777;

const SYMLINK_RESOLVE_LIMIT = 40;

interface CachedStat {
  isDir: boolean;
  size: number;
  mode: number;
  updatedAt: Date;
}

function fsError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();


export class PostgresFs implements IFileSystem {
  private pathCache = new Set<string>();
  private dirCache = new Map<string, string[]>();
  private statCache = new Map<string, CachedStat>();
  private cacheWarmed = false;

  constructor(
    private sql: DbClient,
    private tenantId: string
  ) {}

  // ---------------------------------------------------------------------------
  // Cache management
  // ---------------------------------------------------------------------------

  async warmCache(): Promise<void> {
    const rows = await this.sql`
      SELECT path, is_dir, size, mode, updated_at
      FROM vfs_files
      WHERE tenant_id = ${this.tenantId}
    `;
    this.pathCache.clear();
    this.dirCache.clear();
    this.statCache.clear();

    this.pathCache.add("/");
    this.dirCache.set("/", []);

    for (const row of rows) {
      const p = row.path as string;
      this.pathCache.add(p);
      this.statCache.set(p, {
        isDir: row.is_dir as boolean,
        size: row.size as number,
        mode: row.mode as number,
        updatedAt: row.updated_at as Date,
      });
      const parent = parentDir(p);
      if (!this.dirCache.has(parent)) {
        this.dirCache.set(parent, []);
      }
      this.dirCache.get(parent)!.push(basename(p));
    }
    this.cacheWarmed = true;
  }

  private invalidateCache(path: string): void {
    this.pathCache.delete(path);
    this.statCache.delete(path);
    const parent = parentDir(path);
    const children = this.dirCache.get(parent);
    if (children) {
      const name = basename(path);
      const idx = children.indexOf(name);
      if (idx !== -1) children.splice(idx, 1);
    }
    this.dirCache.delete(path);
  }

  private addToCache(path: string, isDir: boolean, size: number, mode: number): void {
    this.pathCache.add(path);
    this.statCache.set(path, { isDir, size, mode, updatedAt: new Date() });
    const parent = parentDir(path);
    if (!this.dirCache.has(parent)) {
      this.dirCache.set(parent, []);
    }
    const children = this.dirCache.get(parent)!;
    const name = basename(path);
    if (!children.includes(name)) {
      children.push(name);
    }
  }

  // ---------------------------------------------------------------------------
  // IFileSystem implementation
  // ---------------------------------------------------------------------------

  async readFile(path: string, _options?: ReadFileOptions | BufferEncoding): Promise<string> {
    const resolved = normalizePath(path);
    const rows = await this.sql`
      SELECT content, is_dir FROM vfs_files
      WHERE tenant_id = ${this.tenantId} AND path = ${resolved}
    `;
    if (rows.length === 0) {
      throw fsError("ENOENT", `no such file or directory: ${resolved}`);
    }
    if (rows[0].is_dir) {
      throw fsError("EISDIR", `illegal operation on a directory: ${resolved}`);
    }
    return (rows[0].content as string) ?? "";
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const content = await this.readFile(path);
    return encoder.encode(content);
  }

  async writeFile(
    path: string,
    content: FileContent,
    _options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    const resolved = normalizePath(path);
    const text = typeof content === "string" ? content : decoder.decode(content);

    await this.ensureParentDirs(resolved);

    await this.sql`
      INSERT INTO vfs_files (tenant_id, path, is_dir, content, mode)
      VALUES (${this.tenantId}, ${resolved}, false, ${text}, ${MODE_FILE})
      ON CONFLICT (tenant_id, path)
      DO UPDATE SET content = ${text}, is_dir = false
    `;
    // size comes from the generated column; use byte length for cache
    this.addToCache(resolved, false, Buffer.byteLength(text), MODE_FILE);
  }

  async appendFile(
    path: string,
    content: FileContent,
    _options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    const resolved = normalizePath(path);
    const text = typeof content === "string" ? content : decoder.decode(content);

    await this.ensureParentDirs(resolved);

    await this.sql`
      INSERT INTO vfs_files (tenant_id, path, is_dir, content, mode)
      VALUES (${this.tenantId}, ${resolved}, false, ${text}, ${MODE_FILE})
      ON CONFLICT (tenant_id, path)
      DO UPDATE SET content = COALESCE(vfs_files.content, '') || ${text}
    `;
    // Cache size is now stale — remove stat so next stat() fetches from DB
    this.statCache.delete(resolved);
    // Ensure path and dir entries exist in cache (without a stat)
    this.pathCache.add(resolved);
    const parent = parentDir(resolved);
    if (!this.dirCache.has(parent)) {
      this.dirCache.set(parent, []);
    }
    const children = this.dirCache.get(parent)!;
    const name = basename(resolved);
    if (!children.includes(name)) {
      children.push(name);
    }
  }

  async exists(path: string): Promise<boolean> {
    const resolved = normalizePath(path);
    if (resolved === "/") return true;
    if (this.pathCache.has(resolved)) return true;
    // If cache is fully warmed, a miss means the path doesn't exist
    if (this.cacheWarmed) return false;

    const rows = await this.sql`
      SELECT 1 FROM vfs_files
      WHERE tenant_id = ${this.tenantId} AND path = ${resolved}
      LIMIT 1
    `;
    return rows.length > 0;
  }

  async stat(path: string): Promise<FsStat> {
    const resolved = normalizePath(path);

    if (resolved === "/") {
      return { isFile: false, isDirectory: true, isSymbolicLink: false, mode: MODE_DIR, size: 0, mtime: new Date() };
    }

    const cached = this.statCache.get(resolved);
    if (cached) {
      return {
        isFile: !cached.isDir,
        isDirectory: cached.isDir,
        isSymbolicLink: false,
        mode: cached.mode,
        size: cached.size,
        mtime: cached.updatedAt,
      };
    }

    const rows = await this.sql`
      SELECT is_dir, size, mode, updated_at FROM vfs_files
      WHERE tenant_id = ${this.tenantId} AND path = ${resolved}
    `;
    if (rows.length === 0) {
      throw fsError("ENOENT", `no such file or directory: ${resolved}`);
    }
    const row = rows[0];
    const isDir = row.is_dir as boolean;
    // Populate cache for subsequent calls
    this.statCache.set(resolved, {
      isDir,
      size: row.size as number,
      mode: row.mode as number,
      updatedAt: row.updated_at as Date,
    });
    return {
      isFile: !isDir,
      isDirectory: isDir,
      isSymbolicLink: false,
      mode: row.mode as number,
      size: row.size as number,
      mtime: row.updated_at as Date,
    };
  }

  async lstat(path: string): Promise<FsStat> {
    const resolved = normalizePath(path);

    const symlinks = await this.sql`
      SELECT target FROM vfs_symlinks
      WHERE tenant_id = ${this.tenantId} AND path = ${resolved}
    `;
    if (symlinks.length > 0) {
      return {
        isFile: false,
        isDirectory: false,
        isSymbolicLink: true,
        mode: MODE_SYMLINK,
        size: (symlinks[0].target as string).length,
        mtime: new Date(),
      };
    }

    return this.stat(resolved);
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    const resolved = normalizePath(path);
    if (resolved === "/") return;

    if (options?.recursive) {
      await this.assertAncestorsAreDirs(resolved);
      const dirs = [resolved, ...ancestors(resolved)];
      for (const dir of dirs.reverse()) {
        await this.sql`
          INSERT INTO vfs_files (tenant_id, path, is_dir, mode)
          VALUES (${this.tenantId}, ${dir}, true, ${MODE_DIR})
          ON CONFLICT (tenant_id, path) DO NOTHING
        `;
        this.addToCache(dir, true, 0, MODE_DIR);
      }
    } else {
      const parent = parentDir(resolved);
      if (parent !== "/") {
        const parentStat = await this.stat(parent);
        if (!parentStat.isDirectory) {
          throw fsError("ENOTDIR", `not a directory: ${parent}`);
        }
      }
      const existing = await this.sql`
        SELECT is_dir FROM vfs_files
        WHERE tenant_id = ${this.tenantId} AND path = ${resolved}
      `;
      if (existing.length > 0) {
        if (existing[0].is_dir) return;
        throw fsError("EEXIST", `file already exists: ${resolved}`);
      }
      await this.sql`
        INSERT INTO vfs_files (tenant_id, path, is_dir, mode)
        VALUES (${this.tenantId}, ${resolved}, true, ${MODE_DIR})
      `;
      this.addToCache(resolved, true, 0, MODE_DIR);
    }
  }

  async readdir(path: string): Promise<string[]> {
    const resolved = normalizePath(path);

    if (this.cacheWarmed && this.dirCache.has(resolved)) {
      return [...this.dirCache.get(resolved)!];
    }

    const prefix = escapeLike(resolved === "/" ? "/" : resolved + "/");
    const rows = await this.sql`
      SELECT path FROM vfs_files
      WHERE tenant_id = ${this.tenantId}
        AND path LIKE ${prefix + '%'} ESCAPE '\'
        AND path NOT LIKE ${prefix + '%/%'} ESCAPE '\'
      UNION
      SELECT path FROM vfs_symlinks
      WHERE tenant_id = ${this.tenantId}
        AND path LIKE ${prefix + '%'} ESCAPE '\'
        AND path NOT LIKE ${prefix + '%/%'} ESCAPE '\'
    `;

    const names = rows.map((row) => basename(row.path as string));
    return [...new Set(names)].sort();
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    const resolved = normalizePath(path);
    const prefix = escapeLike(resolved === "/" ? "/" : resolved + "/");

    const rows = await this.sql`
      SELECT path, is_dir, false AS is_symlink FROM vfs_files
      WHERE tenant_id = ${this.tenantId}
        AND path LIKE ${prefix + '%'} ESCAPE '\'
        AND path NOT LIKE ${prefix + '%/%'} ESCAPE '\'
      UNION ALL
      SELECT path, false AS is_dir, true AS is_symlink FROM vfs_symlinks
      WHERE tenant_id = ${this.tenantId}
        AND path LIKE ${prefix + '%'} ESCAPE '\'
        AND path NOT LIKE ${prefix + '%/%'} ESCAPE '\'
    `;

    const entries: DirentEntry[] = rows.map((row) => {
      const isSymlink = row.is_symlink as boolean;
      const isDir = row.is_dir as boolean;
      return {
        name: basename(row.path as string),
        isFile: !isDir && !isSymlink,
        isDirectory: isDir,
        isSymbolicLink: isSymlink,
      };
    });

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    const resolved = normalizePath(path);

    if (!options?.force) {
      const ex = await this.exists(resolved);
      if (!ex) {
        throw fsError("ENOENT", `no such file or directory: ${resolved}`);
      }
    }

    if (options?.recursive) {
      const likePattern = escapeLike(resolved) + "/%";
      await this.sql.begin(async (tx) => {
        await tx`
          DELETE FROM vfs_files
          WHERE tenant_id = ${this.tenantId}
            AND (path = ${resolved} OR path LIKE ${likePattern} ESCAPE '\')
        `;
        await tx`
          DELETE FROM vfs_symlinks
          WHERE tenant_id = ${this.tenantId}
            AND (path = ${resolved} OR path LIKE ${likePattern} ESCAPE '\')
        `;
      });
      // Collect paths to invalidate first, then mutate — never mutate during iteration
      const toInvalidate = [...this.pathCache].filter(
        (p) => p === resolved || p.startsWith(resolved + "/")
      );
      for (const p of toInvalidate) {
        this.invalidateCache(p);
      }
    } else {
      const st = await this.stat(resolved);
      if (st.isDirectory) {
        const children = await this.readdir(resolved);
        if (children.length > 0) {
          throw fsError("ENOTEMPTY", `directory not empty: ${resolved}`);
        }
      }
      await this.sql.begin(async (tx) => {
        await tx`DELETE FROM vfs_files WHERE tenant_id = ${this.tenantId} AND path = ${resolved}`;
        await tx`DELETE FROM vfs_symlinks WHERE tenant_id = ${this.tenantId} AND path = ${resolved}`;
      });
      this.invalidateCache(resolved);
    }
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const srcResolved = normalizePath(src);
    const destResolved = normalizePath(dest);

    const srcStat = await this.stat(srcResolved);

    if (srcStat.isDirectory) {
      if (!options?.recursive) {
        throw fsError("EISDIR", `is a directory: ${srcResolved}`);
      }

      await this.ensureParentDirs(destResolved);

      const likePattern = escapeLike(srcResolved) + "/%";
      const rows = await this.sql`
        SELECT path, is_dir, content, mode FROM vfs_files
        WHERE tenant_id = ${this.tenantId}
          AND (path = ${srcResolved} OR path LIKE ${likePattern} ESCAPE '\')
      `;
      for (const row of rows) {
        const newPath = destResolved + (row.path as string).slice(srcResolved.length);
        await this.sql`
          INSERT INTO vfs_files (tenant_id, path, is_dir, content, mode)
          VALUES (${this.tenantId}, ${newPath}, ${row.is_dir}, ${row.content}, ${row.mode})
          ON CONFLICT (tenant_id, path)
          DO UPDATE SET content = ${row.content}, is_dir = ${row.is_dir}, mode = ${row.mode}
        `;
        this.addToCache(newPath, row.is_dir as boolean, 0, row.mode as number);
      }

      // Also copy symlinks under the source tree
      const symlinks = await this.sql`
        SELECT path, target FROM vfs_symlinks
        WHERE tenant_id = ${this.tenantId}
          AND (path = ${srcResolved} OR path LIKE ${likePattern} ESCAPE '\')
      `;
      for (const sym of symlinks) {
        const newPath = destResolved + (sym.path as string).slice(srcResolved.length);
        await this.sql`
          INSERT INTO vfs_symlinks (tenant_id, path, target)
          VALUES (${this.tenantId}, ${newPath}, ${sym.target})
          ON CONFLICT (tenant_id, path) DO UPDATE SET target = ${sym.target}
        `;
      }
    } else {
      const content = await this.readFile(srcResolved);
      await this.writeFile(destResolved, content);
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    const srcResolved = normalizePath(src);
    const destResolved = normalizePath(dest);

    const srcExists = (await this.exists(srcResolved)) || (await this.sql`
      SELECT 1 FROM vfs_symlinks
      WHERE tenant_id = ${this.tenantId} AND path = ${srcResolved} LIMIT 1
    `).length > 0;
    if (!srcExists) {
      throw fsError("ENOENT", `no such file or directory: ${srcResolved}`);
    }

    const destParent = parentDir(destResolved);
    if (destParent !== "/") {
      const parentStat = await this.stat(destParent);
      if (!parentStat.isDirectory) {
        throw fsError("ENOTDIR", `not a directory: ${destParent}`);
      }
    }

    const likePattern = escapeLike(srcResolved) + "/%";

    await this.sql`
      UPDATE vfs_files
      SET path = ${destResolved} || substr(path, ${srcResolved.length + 1})
      WHERE tenant_id = ${this.tenantId}
        AND (path = ${srcResolved} OR path LIKE ${likePattern} ESCAPE '\')
    `;

    await this.sql`
      UPDATE vfs_symlinks
      SET path = ${destResolved} || substr(path, ${srcResolved.length + 1})
      WHERE tenant_id = ${this.tenantId}
        AND (path = ${srcResolved} OR path LIKE ${likePattern} ESCAPE '\')
    `;

    // Collect then invalidate — never mutate Set during iteration
    const toInvalidate = [...this.pathCache].filter(
      (p) => p === srcResolved || p.startsWith(srcResolved + "/")
    );
    for (const p of toInvalidate) {
      this.invalidateCache(p);
    }
    this.cacheWarmed = false;
  }

  resolvePath(base: string, path: string): string {
    if (path.startsWith("/")) return normalizePath(path);
    return normalizePath(base + "/" + path);
  }

  getAllPaths(): string[] {
    return [...this.pathCache];
  }

  async chmod(path: string, mode: number): Promise<void> {
    const resolved = normalizePath(path);
    const result = await this.sql`
      UPDATE vfs_files SET mode = ${mode}
      WHERE tenant_id = ${this.tenantId} AND path = ${resolved}
    `;
    if (result.count === 0) {
      throw fsError("ENOENT", `no such file or directory: ${resolved}`);
    }
    const cached = this.statCache.get(resolved);
    if (cached) cached.mode = mode;
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    const resolved = normalizePath(linkPath);
    await this.sql`
      INSERT INTO vfs_symlinks (tenant_id, path, target)
      VALUES (${this.tenantId}, ${resolved}, ${target})
      ON CONFLICT (tenant_id, path) DO UPDATE SET target = ${target}
    `;
  }

  async readlink(path: string): Promise<string> {
    const resolved = normalizePath(path);
    const rows = await this.sql`
      SELECT target FROM vfs_symlinks
      WHERE tenant_id = ${this.tenantId} AND path = ${resolved}
    `;
    if (rows.length === 0) {
      throw fsError("EINVAL", `not a symbolic link: ${resolved}`);
    }
    return rows[0].target as string;
  }

  async realpath(path: string): Promise<string> {
    const resolved = normalizePath(path);
    let current = resolved;
    for (let i = 0; i < SYMLINK_RESOLVE_LIMIT; i++) {
      const rows = await this.sql`
        SELECT target FROM vfs_symlinks
        WHERE tenant_id = ${this.tenantId} AND path = ${current}
      `;
      if (rows.length === 0) return current;
      const target = rows[0].target as string;
      current = target.startsWith("/") ? normalizePath(target) : normalizePath(parentDir(current) + "/" + target);
    }
    throw fsError("ELOOP", `too many levels of symbolic links: ${path}`);
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    const content = await this.readFile(existingPath);
    await this.writeFile(newPath, content);
  }

  async utimes(path: string, _atime: Date, mtime: Date): Promise<void> {
    const resolved = normalizePath(path);
    await this.sql`
      UPDATE vfs_files SET updated_at = ${mtime}
      WHERE tenant_id = ${this.tenantId} AND path = ${resolved}
    `;
    const cached = this.statCache.get(resolved);
    if (cached) cached.updatedAt = mtime;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Throw ENOTDIR if any ancestor of `path` exists and is a file (not a dir).
   * Uses statCache when available, falls back to a single DB query for unknowns.
   */
  private async assertAncestorsAreDirs(path: string): Promise<void> {
    const dirs = ancestors(path);
    if (dirs.length === 0) return;

    const unchecked: string[] = [];
    for (const dir of dirs) {
      const cached = this.statCache.get(dir);
      if (cached) {
        if (!cached.isDir) {
          throw fsError("ENOTDIR", `not a directory: ${dir}`);
        }
      } else if (this.cacheWarmed) {
        if (this.pathCache.has(dir)) {
          unchecked.push(dir);
        }
      } else {
        unchecked.push(dir);
      }
    }

    if (unchecked.length > 0) {
      const rows = await this.sql`
        SELECT path, is_dir FROM vfs_files
        WHERE tenant_id = ${this.tenantId} AND path = ANY(${unchecked})
      `;
      for (const row of rows) {
        if (!(row.is_dir as boolean)) {
          throw fsError("ENOTDIR", `not a directory: ${row.path as string}`);
        }
      }
    }
  }

  private async ensureParentDirs(filePath: string): Promise<void> {
    const dirs = ancestors(filePath);
    if (dirs.length === 0) return;

    await this.assertAncestorsAreDirs(filePath);

    const missing: string[] = [];
    for (const dir of dirs) {
      if (!this.pathCache.has(dir)) {
        missing.push(dir);
      }
    }
    if (missing.length === 0) return;

    for (const dir of missing) {
      await this.sql`
        INSERT INTO vfs_files (tenant_id, path, is_dir, mode)
        VALUES (${this.tenantId}, ${dir}, true, ${MODE_DIR})
        ON CONFLICT (tenant_id, path) DO NOTHING
      `;
      this.addToCache(dir, true, 0, MODE_DIR);
    }
  }
}
