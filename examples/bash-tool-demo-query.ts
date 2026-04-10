/**
 * Demo: ad-hoc querying of an existing postgres-vfs tenant.
 *
 * Unlike bash-tool-demo-stream.ts, this script does NOT pre-load any files.
 * It assumes the tenant is already populated (via one of the seeds, via a
 * previous demo run that skipped cleanup, via your own writeFiles calls,
 * etc.) and just runs one streaming query against it.
 *
 * Useful for:
 *   - Iterating on a prompt against an already-seeded workspace
 *   - Asking follow-up questions after a previous run left files behind
 *   - Running the same question against multiple tenants to compare
 *   - Driving a tenant you populated from your own application code
 *
 * Prerequisites:
 *   1. PostgreSQL running with pgvector (docker or local)
 *   2. DATABASE_URL set
 *   3. ANTHROPIC_API_KEY set
 *   4. The target tenant already has files in it
 *
 * Run:
 *   bun run examples/bash-tool-demo-query.ts \
 *     --tenant bash-tool-demo-meetings \
 *     --prompt "Who has the most action items and why?"
 *
 *   # Custom system prompt, read both prompts from files
 *   bun run examples/bash-tool-demo-query.ts \
 *     --tenant my-workspace \
 *     --system @prompts/security-auditor.txt \
 *     --prompt  @prompts/task.txt
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "../src/db/client.ts";
import { createPostgresVfsTool } from "../src/bash-tool/index.ts";
import { streamText, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const DEFAULT_SYSTEM =
  "You have access to a virtual filesystem backed by PostgreSQL. Use the bash, readFile, and writeFile tools to explore files and complete tasks. Always start by exploring the filesystem structure (e.g. `find / -type f` or `ls /`) before reading individual files.";

const HELP = `Usage: bun run examples/bash-tool-demo-query.ts --tenant <id> --prompt <text> [options]

Run a single streaming query against an existing postgres-vfs tenant.
This script does NOT write any seed files; it assumes the tenant is already populated.

Required:
  --tenant, -t <id>       Tenant id to query (e.g. bash-tool-demo-meetings)
  --prompt, -p <text>     User prompt. Prefix with @ to read from a file
                          (e.g. --prompt @prompts/task.txt)

Optional:
  --system, -s <text>     System prompt. Prefix with @ to read from a file.
                          Default: generic "explore the VFS" instructions.
  --model <name>          Anthropic model id. Default: claude-sonnet-4-20250514
  --max-steps <n>         Max tool-loop iterations. Default: 15
  --help, -h              Show this help

Examples:
  # Query an existing seeded tenant
  bun run examples/bash-tool-demo-query.ts \\
    --tenant bash-tool-demo-meetings \\
    --prompt "Who has the most action items and why?"

  # Re-ask the contracts seed a different question without re-seeding
  bun run examples/bash-tool-demo-query.ts \\
    --tenant bash-tool-demo-contracts \\
    --prompt "Which contract has the longest payment terms and by how much?"

  # Custom system + prompt from files
  bun run examples/bash-tool-demo-query.ts \\
    --tenant my-workspace \\
    --system @prompts/security-auditor.txt \\
    --prompt @prompts/task.txt
`;

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    tenant: { type: "string", short: "t" },
    system: { type: "string", short: "s" },
    prompt: { type: "string", short: "p" },
    model: { type: "string", default: "claude-sonnet-4-20250514" },
    "max-steps": { type: "string", default: "15" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

if (!values.tenant || !values.prompt) {
  console.error(HELP);
  console.error("Error: --tenant and --prompt are both required.");
  process.exit(1);
}

/**
 * Resolve a CLI string that may be either a literal value or an @-prefixed
 * file path. Makes it painless to pass long multi-line prompts without
 * fighting shell quoting.
 */
function resolveArg(value: string): string {
  if (value.startsWith("@")) {
    const path = value.slice(1);
    try {
      return readFileSync(path, "utf-8").trimEnd();
    } catch (err) {
      console.error(`Error: could not read ${path}: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  return value;
}

const tenantId = values.tenant;
const userPrompt = resolveArg(values.prompt);
const systemPrompt = values.system ? resolveArg(values.system) : DEFAULT_SYSTEM;
const model = values.model ?? "claude-sonnet-4-20250514";
const maxSteps = Number(values["max-steps"] ?? "15");

if (!Number.isFinite(maxSteps) || maxSteps < 1) {
  console.error(`Error: invalid --max-steps value: ${values["max-steps"]}`);
  process.exit(1);
}

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const sql = createClient();

console.log(`Tenant:    ${tenantId}`);
console.log(`Model:     ${model}`);
console.log(`Max steps: ${maxSteps}`);
console.log("─".repeat(60));

// Bind the tool to the existing tenant. No writeFiles — we're querying
// whatever is already there.
const { tools } = await createPostgresVfsTool({
  sql,
  tenantId,
});

// Quick sanity check: warn (don't fail) if the tenant has no files, so a
// confused agent searching an empty filesystem doesn't mislead the user.
const [{ count }] = await sql<{ count: number }[]>`
  SELECT COUNT(*)::int AS count
  FROM vfs_files
  WHERE tenant_id = ${tenantId} AND is_dir = false
`;
if (count === 0) {
  console.log(
    `\x1b[33mWarning: tenant "${tenantId}" has 0 files. The agent will be working against an empty filesystem.\x1b[0m`,
  );
} else {
  console.log(`Tenant has ${count} file(s). Streaming response from Claude...\n`);
}
console.log("─".repeat(60));

// Stream the query. Same rendering approach as bash-tool-demo-stream.ts —
// fullStream gives us text deltas, tool calls, and tool results interleaved
// so the user sees reasoning and actions together.
const result = streamText({
  model: anthropic(model),
  tools,
  stopWhen: stepCountIs(maxSteps),
  system: systemPrompt,
  prompt: userPrompt,
});

let stepIndex = 0;
let inText = false;

for await (const event of result.fullStream) {
  switch (event.type) {
    case "start-step": {
      stepIndex++;
      process.stdout.write(`\n\x1b[90m[step ${stepIndex}]\x1b[0m `);
      inText = false;
      break;
    }

    case "text-delta": {
      const delta = (event as any).text ?? (event as any).textDelta ?? "";
      if (delta) {
        if (!inText) {
          process.stdout.write("\n");
          inText = true;
        }
        process.stdout.write(delta);
      }
      break;
    }

    case "tool-call": {
      const call = event as any;
      const input = call.input ?? call.args ?? {};
      if (inText) {
        process.stdout.write("\n");
        inText = false;
      }
      if (call.toolName === "bash" && input.command) {
        console.log(`  \x1b[36m$ ${input.command}\x1b[0m`);
      } else {
        const preview = JSON.stringify(input).slice(0, 100);
        console.log(`  \x1b[33m${call.toolName}\x1b[0m(${preview})`);
      }
      break;
    }

    case "tool-result": {
      const res = event as any;
      const output = res.output ?? res.result ?? "";
      const text =
        typeof output === "string" ? output : JSON.stringify(output);
      const preview = text.replace(/\n/g, " ").slice(0, 80);
      console.log(
        `  \x1b[90m└─ ${preview}${text.length > 80 ? "…" : ""}\x1b[0m`,
      );
      break;
    }

    case "error": {
      console.error(`\n\x1b[31m[error]\x1b[0m`, (event as any).error);
      break;
    }
  }
}

const steps = await result.steps;
const finalText = await result.text;

console.log("\n" + "─".repeat(60));
console.log(`\nAgent completed in ${steps.length} step(s).`);

if (finalText) {
  console.log("\nFinal agent response:\n");
  console.log(finalText);
}

// No cleanup — the caller owns the tenant and decides when to wipe it.
// Use examples/clear-seed.ts for known seed tenants, or delete manually.
await sql.end();
