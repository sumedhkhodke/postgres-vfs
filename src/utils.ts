import { escapeLike } from "./fs/path-utils.js";

/** Extract a message string from an unknown error */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Format a number[] as a pgvector literal string '[0.1,0.2,...]' */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Truncate a string to a max length */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

/** Build a SQL LIKE pattern from user input, escaping wildcards */
export function buildSearchPattern(query: string): string {
  return `%${escapeLike(query)}%`;
}
