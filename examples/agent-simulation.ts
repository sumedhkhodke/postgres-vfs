/**
 * Simulates an AI agent interacting with postgres-vfs.
 *
 * Uses the demo-ui tenant data:
 *   /notes/ideas.md, /notes/todo.md
 *   /projects/webapp/src/server.ts, /projects/webapp/src/database.ts
 *   /projects/webapp/docs/api.md, /projects/webapp/README.md
 *
 * No LLM API key needed — simulates the tool calls directly.
 *
 * Usage:
 *   bun run examples/agent-simulation.ts
 */
import { createClient } from "../src/db/client.ts";
import { createPostgresSandbox } from "../src/bash-tool/adapter.ts";

const sql = createClient();
const sandbox = await createPostgresSandbox({ sql, tenantId: "demo-ui" });

async function toolCall(name: string, input: Record<string, string>) {
  console.log(`\n\x1b[33m[Agent Tool Call]\x1b[0m ${name}(${JSON.stringify(input)})`);

  let result: string;
  switch (name) {
    case "bash": {
      const r = await sandbox.executeCommand(input.command);
      result = r.stdout + (r.stderr ? `\n[stderr]: ${r.stderr}` : "");
      break;
    }
    case "readFile": {
      result = await sandbox.readFile(input.path);
      break;
    }
    case "writeFile": {
      await sandbox.writeFiles([{ path: input.path, content: input.content }]);
      result = `Wrote ${input.path}`;
      break;
    }
    default:
      result = `Unknown tool: ${name}`;
  }

  console.log(`\x1b[36m[Tool Result]\x1b[0m ${result.slice(0, 300)}${result.length > 300 ? "..." : ""}`);
  return result;
}

console.log("\x1b[1;35m╔══════════════════════════════════════════════════╗\x1b[0m");
console.log("\x1b[1;35m║  Agent Simulation: exploring demo-ui workspace   ║\x1b[0m");
console.log("\x1b[1;35m╚══════════════════════════════════════════════════╝\x1b[0m");

// Step 1: Agent orients itself
console.log("\n\x1b[1m--- Step 1: What's in this workspace? ---\x1b[0m");
await toolCall("bash", { command: "find / -type f" });

// Step 2: Agent explores the project structure
console.log("\n\x1b[1m--- Step 2: Explore the webapp project ---\x1b[0m");
await toolCall("bash", { command: "ls /projects/webapp" });
await toolCall("bash", { command: "ls /projects/webapp/src" });
await toolCall("bash", { command: "wc -l /projects/webapp/src/server.ts /projects/webapp/src/database.ts" });

// Step 3: Agent reads the server code
console.log("\n\x1b[1m--- Step 3: Read the server code ---\x1b[0m");
await toolCall("readFile", { path: "/projects/webapp/src/server.ts" });

// Step 4: Agent finds all TODO comments
console.log("\n\x1b[1m--- Step 4: Find all TODOs ---\x1b[0m");
await toolCall("bash", { command: "grep -rn TODO /projects" });

// Step 5: Agent reads the database module
console.log("\n\x1b[1m--- Step 5: Read the database module ---\x1b[0m");
await toolCall("readFile", { path: "/projects/webapp/src/database.ts" });

// Step 6: Agent reads the API docs
console.log("\n\x1b[1m--- Step 6: Read the API documentation ---\x1b[0m");
await toolCall("readFile", { path: "/projects/webapp/docs/api.md" });

// Step 7: Agent uses search to find relevant files
console.log("\n\x1b[1m--- Step 7: Search for concepts ---\x1b[0m");
await toolCall("bash", { command: "search authentication" });
await toolCall("bash", { command: "search express server" });

// Step 8: Agent uses pipes for analysis
console.log("\n\x1b[1m--- Step 8: Analyze with pipes ---\x1b[0m");
await toolCall("bash", { command: "grep -r 'import' /projects/webapp/src | sort" });
await toolCall("bash", { command: "find / -name '*.md' -type f | wc -l" });
await toolCall("bash", { command: "cat /projects/webapp/src/server.ts | grep 'app\\.' | wc -l" });

// Step 9: Agent checks the notes
console.log("\n\x1b[1m--- Step 9: Check team notes ---\x1b[0m");
await toolCall("readFile", { path: "/notes/todo.md" });
await toolCall("readFile", { path: "/notes/ideas.md" });

// Step 10: Agent tags files and checks recent activity
console.log("\n\x1b[1m--- Step 10: Organize and check activity ---\x1b[0m");
await toolCall("bash", { command: "tag /projects/webapp/src/server.ts needs-review" });
await toolCall("bash", { command: "tag /projects/webapp/src/database.ts needs-review" });
await toolCall("bash", { command: "tags needs-review" });
await toolCall("bash", { command: "recent 5" });

// Step 11: Agent writes a summary based on everything it found
console.log("\n\x1b[1m--- Step 11: Write analysis report ---\x1b[0m");
await toolCall("writeFile", {
  path: "/reports/code-review.md",
  content: `# Code Review: webapp

## Overview
Express server with PostgreSQL database layer. 2 source files, 1 API doc, 1 README.

## Files Reviewed
- server.ts (10 lines) — HTTP server with health endpoint and rate limiting TODO
- database.ts — PostgreSQL pool with getUsers() query

## Issues Found
- TODO: add rate limiting (server.ts)
- No error handling on database queries
- API docs reference authentication but no auth middleware exists

## Recommendations
1. Add rate limiting middleware (express-rate-limit)
2. Add try/catch around pool.query calls
3. Implement JWT auth before exposing user endpoints
`,
});

// Step 12: Verify the report was saved
console.log("\n\x1b[1m--- Step 12: Verify report ---\x1b[0m");
await toolCall("bash", { command: "find /reports -type f" });
await toolCall("readFile", { path: "/reports/code-review.md" });

console.log("\n\x1b[1;35m╔══════════════════════════════════════════════════╗\x1b[0m");
console.log("\x1b[1;35m║  Simulation complete — 24 tool calls              ║\x1b[0m");
console.log("\x1b[1;35m║  All data in PostgreSQL, zero files on disk       ║\x1b[0m");
console.log("\x1b[1;35m╚══════════════════════════════════════════════════╝\x1b[0m\n");

await sql.end();
