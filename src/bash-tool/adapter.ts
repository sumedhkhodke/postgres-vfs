/**
 * Adapter that bridges PostgresFs + just-bash into bash-tool's Sandbox interface.
 *
 * This lets you use postgres-vfs with Vercel's bash-tool and AI SDK:
 *
 *   const { tools } = await createPostgresVfsTool({ sql, tenantId });
 *   const result = await generateText({ model, tools, prompt: "..." });
 */
import { Bash } from "just-bash";
import type { Sandbox, CommandResult } from "bash-tool";
import { embedFile } from "../fs/embeddings.js";
import { PostgresFs } from "../fs/postgres-fs.js";
import { createCustomCommands } from "../commands/index.js";
import type { DbClient } from "../db/client.js";

export interface PostgresVfsSandboxOptions {
  sql: DbClient;
  tenantId?: string;
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Creates a bash-tool compatible Sandbox backed by PostgreSQL.
 *
 * The returned object implements bash-tool's Sandbox interface:
 *   - executeCommand(command) → runs via just-bash + PostgresFs
 *   - readFile(path) → reads from PostgreSQL
 *   - writeFiles(files) → writes to PostgreSQL
 */
export async function createPostgresSandbox(
  options: PostgresVfsSandboxOptions
): Promise<Sandbox> {
  const tenantId = options.tenantId ?? process.env.TENANT_ID ?? "default";

  const pgfs = new PostgresFs(options.sql, tenantId);
  await pgfs.warmCache();

  const rootExists = await pgfs.exists("/");
  if (!rootExists) {
    await pgfs.mkdir("/", { recursive: true });
  }

  const customCommands = createCustomCommands(options.sql, tenantId);

  const bash = new Bash({
    fs: pgfs,
    cwd: options.cwd ?? "/",
    env: {
      HOME: "/",
      USER: tenantId,
      SHELL: "/bin/bash",
      TERM: "xterm-256color",
      ...options.env,
    },
    customCommands,
    defenseInDepth: false, // required for Bun + postgres.js compatibility
    executionLimits: {
      maxCallDepth: 100,
      maxCommandCount: 10000,
      maxLoopIterations: 10000,
    },
  });

  return {
    async executeCommand(command: string): Promise<CommandResult> {
      const result = await bash.exec(command);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    },

    async readFile(path: string): Promise<string> {
      return pgfs.readFile(path);
    },

    async writeFiles(
      files: Array<{ path: string; content: string | Buffer }>
    ): Promise<void> {
      for (const file of files) {
        const content =
          typeof file.content === "string"
            ? file.content
            : file.content.toString("utf-8");
        await pgfs.writeFile(file.path, content);
        // Fire-and-forget: generate embedding if OPENAI_API_KEY is set
        embedFile(options.sql, tenantId, file.path, content).catch(() => {});
      }
    },
  };
}
