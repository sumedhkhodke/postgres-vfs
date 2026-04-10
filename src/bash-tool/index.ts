/**
 * bash-tool integration for postgres-vfs.
 *
 * Usage with Vercel AI SDK:
 *
 *   import { createPostgresVfsTool } from "postgres-vfs/bash-tool";
 *   import { generateText } from "ai";
 *
 *   const { tools } = await createPostgresVfsTool({
 *     sql: createClient("postgres://..."),
 *     tenantId: "my-agent",
 *   });
 *
 *   const { text } = await generateText({
 *     model: anthropic("claude-sonnet-4-20250514"),
 *     tools,
 *     prompt: "Find all TODO comments in /projects",
 *   });
 */
import { createBashTool, type CreateBashToolOptions, type BashToolkit } from "bash-tool";
import { createPostgresSandbox, type PostgresVfsSandboxOptions } from "./adapter.js";

export interface CreatePostgresVfsToolOptions extends PostgresVfsSandboxOptions {
  /** Extra instructions appended to the bash tool's system prompt */
  extraInstructions?: string;
  /** Maximum output length from bash commands (default: 30000) */
  maxOutputLength?: number;
  /** Hooks called before/after bash execution */
  onBeforeBashCall?: CreateBashToolOptions["onBeforeBashCall"];
  onAfterBashCall?: CreateBashToolOptions["onAfterBashCall"];
}

/**
 * Create a bash-tool toolkit backed by PostgreSQL.
 *
 * Returns `{ tools, sandbox }` where `tools` contains:
 *   - `bash` — execute bash commands against the VFS
 *   - `readFile` — read a file from the VFS
 *   - `writeFile` — write a file to the VFS
 *
 * Compatible with Vercel AI SDK's `generateText`, `streamText`, and `ToolLoopAgent`.
 */
export async function createPostgresVfsTool(
  options: CreatePostgresVfsToolOptions
): Promise<BashToolkit> {
  const sandbox = await createPostgresSandbox(options);

  return createBashTool({
    sandbox,
    destination: options.cwd ?? "/",
    extraInstructions: options.extraInstructions,
    maxOutputLength: options.maxOutputLength,
    onBeforeBashCall: options.onBeforeBashCall,
    onAfterBashCall: options.onAfterBashCall,
  });
}

export { createPostgresSandbox, type PostgresVfsSandboxOptions } from "./adapter.js";
