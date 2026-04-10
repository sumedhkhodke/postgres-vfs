import type { DbClient } from "../db/client.js";
import { toVectorLiteral } from "../utils.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

/** Whether auto-embedding is available (OPENAI_API_KEY is set) */
export function isEmbeddingEnabled(): boolean {
  return !!OPENAI_API_KEY;
}

/**
 * Generate an embedding vector for the given text via OpenAI API.
 * Returns null if OPENAI_API_KEY is not set or the call fails.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;
  // Truncate to ~8000 tokens (~32000 chars) to stay within model limits
  const truncated = text.slice(0, 32000);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncated,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { data: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate and store an embedding for a file.
 * Silently skips if OPENAI_API_KEY is not set or content is empty.
 */
export async function embedFile(
  sql: DbClient,
  tenantId: string,
  path: string,
  content: string
): Promise<void> {
  if (!OPENAI_API_KEY || !content.trim()) return;
  const embedding = await generateEmbedding(content);
  if (!embedding) return;
  const vecLiteral = toVectorLiteral(embedding);
  await sql`
    UPDATE vfs_files
    SET embedding = ${vecLiteral}::vector
    WHERE tenant_id = ${tenantId} AND path = ${path}
  `;
}
