import { defineCommand } from "just-bash";
import type { CustomCommand } from "just-bash";
import type { DbClient } from "../db/client.js";
import { hybridSearch } from "../fs/search.js";
import { addTag, removeTag, findByTag, recentFiles, updateSummary } from "../fs/metadata.js";
import { errorMessage } from "../utils.js";
import { generateEmbedding } from "../fs/embeddings.js";

const MAX_LIMIT = 1000;

function parseLimit(value: string | undefined, fallback: number = 20): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) return fallback;
  return Math.min(n, MAX_LIMIT);
}

function cmdError(cmd: string, err: unknown): { stdout: string; stderr: string; exitCode: number } {
  return { stdout: "", stderr: `${cmd}: ${errorMessage(err)}\n`, exitCode: 1 };
}

export function createCustomCommands(sql: DbClient, tenantId: string): CustomCommand[] {
  const searchCmd = defineCommand("search", async (args, _ctx) => {
    if (args.length === 0) {
      return { stdout: "", stderr: "Usage: search <query> [--limit N]\n", exitCode: 1 };
    }

    let limit = 20;
    const queryParts: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--limit" && args[i + 1]) {
        limit = parseLimit(args[i + 1]);
        i++;
      } else {
        queryParts.push(args[i]);
      }
    }
    const query = queryParts.join(" ");
    if (!query.trim()) return { stdout: "", stderr: "search: empty query\n", exitCode: 1 };

    try {
      // Embed query for semantic search (returns null if OPENAI_API_KEY not set)
      const embedding = await generateEmbedding(query);
      const results = await hybridSearch(sql, tenantId, query, { limit, embedding: embedding ?? undefined });
      if (results.length === 0) return { stdout: "", stderr: "", exitCode: 0 };
      const output = results
        .map((r) => {
          const summary = r.summary ? ` - ${r.summary}` : "";
          return `${r.score.toFixed(4)}\t${r.path}${summary}`;
        })
        .join("\n") + "\n";
      return { stdout: output, stderr: "", exitCode: 0 };
    } catch (err) {
      return cmdError("search", err);
    }
  });

  const tagCmd = defineCommand("tag", async (args, _ctx) => {
    if (args.length < 2) {
      return { stdout: "", stderr: "Usage: tag <path> <tag>\n", exitCode: 1 };
    }
    try {
      await addTag(sql, tenantId, args[0], args[1]);
      return { stdout: "", stderr: "", exitCode: 0 };
    } catch (err) {
      return cmdError("tag", err);
    }
  });

  const untagCmd = defineCommand("untag", async (args, _ctx) => {
    if (args.length < 2) {
      return { stdout: "", stderr: "Usage: untag <path> <tag>\n", exitCode: 1 };
    }
    try {
      await removeTag(sql, tenantId, args[0], args[1]);
      return { stdout: "", stderr: "", exitCode: 0 };
    } catch (err) {
      return cmdError("untag", err);
    }
  });

  const tagsCmd = defineCommand("tags", async (args, _ctx) => {
    if (args.length === 0) {
      return { stdout: "", stderr: "Usage: tags <tag>\n", exitCode: 1 };
    }
    try {
      const paths = await findByTag(sql, tenantId, args[0]);
      if (paths.length === 0) return { stdout: "", stderr: "", exitCode: 0 };
      return { stdout: paths.join("\n") + "\n", stderr: "", exitCode: 0 };
    } catch (err) {
      return cmdError("tags", err);
    }
  });

  const recentCmd = defineCommand("recent", async (args, _ctx) => {
    const limit = parseLimit(args[0]);
    try {
      const files = await recentFiles(sql, tenantId, limit);
      if (files.length === 0) return { stdout: "", stderr: "", exitCode: 0 };
      const output = files
        .map((f) => `${f.updated_at.toISOString()}\t${f.path}`)
        .join("\n") + "\n";
      return { stdout: output, stderr: "", exitCode: 0 };
    } catch (err) {
      return cmdError("recent", err);
    }
  });

  const summarizeCmd = defineCommand("summarize", async (args, _ctx) => {
    if (args.length < 2) {
      return { stdout: "", stderr: "Usage: summarize <path> <summary text...>\n", exitCode: 1 };
    }
    try {
      await updateSummary(sql, tenantId, args[0], args.slice(1).join(" "));
      return { stdout: "", stderr: "", exitCode: 0 };
    } catch (err) {
      return cmdError("summarize", err);
    }
  });

  return [searchCmd, tagCmd, untagCmd, tagsCmd, recentCmd, summarizeCmd];
}
