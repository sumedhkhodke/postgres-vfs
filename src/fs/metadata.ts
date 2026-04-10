import type { DbClient } from "../db/client.js";
import { toVectorLiteral } from "../utils.js";

export async function updateEmbedding(
  sql: DbClient,
  tenantId: string,
  path: string,
  embedding: number[]
): Promise<void> {
  const vecLiteral = toVectorLiteral(embedding);
  await sql`
    UPDATE vfs_files
    SET embedding = ${vecLiteral}::vector
    WHERE tenant_id = ${tenantId} AND path = ${path}
  `;
}

export async function updateSummary(
  sql: DbClient,
  tenantId: string,
  path: string,
  summary: string
): Promise<void> {
  await sql`
    UPDATE vfs_files SET summary = ${summary}
    WHERE tenant_id = ${tenantId} AND path = ${path}
  `;
}

export async function addTag(sql: DbClient, tenantId: string, path: string, tag: string): Promise<void> {
  await sql`
    UPDATE vfs_files
    SET tags = array_append(tags, ${tag})
    WHERE tenant_id = ${tenantId} AND path = ${path}
      AND NOT (${tag} = ANY(tags))
  `;
}

export async function removeTag(sql: DbClient, tenantId: string, path: string, tag: string): Promise<void> {
  await sql`
    UPDATE vfs_files
    SET tags = array_remove(tags, ${tag})
    WHERE tenant_id = ${tenantId} AND path = ${path}
  `;
}

export async function findByTag(sql: DbClient, tenantId: string, tag: string): Promise<string[]> {
  const rows = await sql`
    SELECT path FROM vfs_files
    WHERE tenant_id = ${tenantId} AND ${tag} = ANY(tags)
    ORDER BY path
  `;
  return rows.map((r) => r.path as string);
}

export async function recentFiles(
  sql: DbClient,
  tenantId: string,
  limit: number = 20
): Promise<{ path: string; updated_at: Date }[]> {
  const rows = await sql`
    SELECT path, updated_at FROM vfs_files
    WHERE tenant_id = ${tenantId} AND is_dir = false
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    path: r.path as string,
    updated_at: r.updated_at as Date,
  }));
}
