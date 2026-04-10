/** Extract a message string from an unknown error */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Format a number[] as a pgvector literal string '[0.1,0.2,...]' */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
