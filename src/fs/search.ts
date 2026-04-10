import type { DbClient } from "../db/client.js";
import { toVectorLiteral } from "../utils.js";

export interface GrepResult {
  path: string;
  lineNumber: number;
  line: string;
}

export interface SearchResult {
  path: string;
  summary: string | null;
  score: number;
}

function mapSearchRows(rows: Record<string, unknown>[]): SearchResult[] {
  return rows.map((r) => ({
    path: r.path as string,
    summary: r.summary as string | null,
    score: Number(r.score),
  }));
}

/**
 * Two-stage grep (like ChromaFs):
 * Stage 1: Coarse filter via PostgreSQL regex
 * Stage 2: Fine filter with JS regex for complex patterns and line numbers
 */
export async function grepFiles(
  sql: DbClient,
  tenantId: string,
  pattern: string,
  options?: {
    paths?: string[];
    caseInsensitive?: boolean;
    maxResults?: number;
  }
): Promise<GrepResult[]> {
  const limit = options?.maxResults ?? 1000;
  const flags = options?.caseInsensitive ? "i" : "";

  // Stage 1: Coarse filter in Postgres
  let rows;
  if (options?.paths && options.paths.length > 0) {
    rows = await sql`
      SELECT path, content FROM vfs_files
      WHERE tenant_id = ${tenantId}
        AND is_dir = false
        AND path = ANY(${options.paths})
        AND content IS NOT NULL
    `;
  } else {
    // Escape Postgres regex special chars for safe coarse filtering
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pgPattern = options?.caseInsensitive ? `(?i)${escaped}` : escaped;
    rows = await sql`
      SELECT path, content FROM vfs_files
      WHERE tenant_id = ${tenantId}
        AND is_dir = false
        AND content IS NOT NULL
        AND content ~ ${pgPattern}
      LIMIT ${limit * 2}
    `;
  }

  // Stage 2: Fine filter — precise regex matching with line numbers
  const results: GrepResult[] = [];
  const regex = new RegExp(pattern, flags);

  for (const row of rows) {
    const content = row.content as string;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push({
          path: row.path as string,
          lineNumber: i + 1,
          line: lines[i],
        });
        if (results.length >= limit) return results;
      }
    }
  }

  return results;
}

export async function ftsSearch(
  sql: DbClient,
  tenantId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const rows = await sql`
    SELECT path, summary,
           ts_rank_cd(content_tsv, websearch_to_tsquery('english', ${query})) AS score
    FROM vfs_files
    WHERE tenant_id = ${tenantId}
      AND is_dir = false
      AND content_tsv @@ websearch_to_tsquery('english', ${query})
    ORDER BY score DESC
    LIMIT ${limit}
  `;
  return mapSearchRows(rows);
}

export async function fuzzySearch(
  sql: DbClient,
  tenantId: string,
  term: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const rows = await sql`
    SELECT path, summary,
           similarity(content, ${term}) AS score
    FROM vfs_files
    WHERE tenant_id = ${tenantId}
      AND is_dir = false
      AND content IS NOT NULL
      AND content % ${term}
    ORDER BY score DESC
    LIMIT ${limit}
  `;
  return mapSearchRows(rows);
}

/**
 * Semantic search using pgvector cosine similarity.
 * Only returns results for files that have embeddings set via updateEmbedding().
 */
export async function semanticSearch(
  sql: DbClient,
  tenantId: string,
  embedding: number[],
  limit: number = 10
): Promise<SearchResult[]> {
  const vecLiteral = toVectorLiteral(embedding);
  const rows = await sql`
    SELECT path, summary,
           1 - (embedding <=> ${vecLiteral}::vector) AS score
    FROM vfs_files
    WHERE tenant_id = ${tenantId}
      AND is_dir = false
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vecLiteral}::vector
    LIMIT ${limit}
  `;
  return mapSearchRows(rows);
}

/**
 * Hybrid search: combine FTS + trigram + optional vector scores.
 * If embedding is provided, includes semantic similarity in ranking.
 * If not, uses FTS + trigram only (no pgvector dependency required).
 */
export async function hybridSearch(
  sql: DbClient,
  tenantId: string,
  query: string,
  options?: {
    embedding?: number[];
    limit?: number;
    weights?: { fts: number; trigram: number; vector: number };
  }
): Promise<SearchResult[]> {
  const limit = options?.limit ?? 20;
  const w = options?.weights ?? { fts: 0.5, trigram: 0.3, vector: 0.2 };

  if (options?.embedding) {
    const vecLiteral = toVectorLiteral(options.embedding);
    const rows = await sql`
      SELECT path, summary,
        (
          COALESCE(ts_rank_cd(content_tsv, websearch_to_tsquery('english', ${query})), 0) * ${w.fts} +
          COALESCE(similarity(content, ${query}), 0) * ${w.trigram} +
          COALESCE(1 - (embedding <=> ${vecLiteral}::vector), 0) * ${w.vector}
        ) AS score
      FROM vfs_files
      WHERE tenant_id = ${tenantId}
        AND is_dir = false
        AND content IS NOT NULL
        AND (
          content_tsv @@ websearch_to_tsquery('english', ${query})
          OR content % ${query}
          OR (embedding IS NOT NULL AND (embedding <=> ${vecLiteral}::vector) < 0.7)
        )
      ORDER BY score DESC
      LIMIT ${limit}
    `;
    return mapSearchRows(rows);
  }

  // No embedding — FTS + trigram only
  const ftsWeight = w.fts + w.vector;
  const rows = await sql`
    SELECT path, summary,
      (
        COALESCE(ts_rank_cd(content_tsv, websearch_to_tsquery('english', ${query})), 0) * ${ftsWeight} +
        COALESCE(similarity(content, ${query}), 0) * ${w.trigram}
      ) AS score
    FROM vfs_files
    WHERE tenant_id = ${tenantId}
      AND is_dir = false
      AND content IS NOT NULL
      AND (
        content_tsv @@ websearch_to_tsquery('english', ${query})
        OR content % ${query}
      )
    ORDER BY score DESC
    LIMIT ${limit}
  `;
  return mapSearchRows(rows);
}
