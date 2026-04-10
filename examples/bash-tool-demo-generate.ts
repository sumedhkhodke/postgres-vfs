/**
 * Demo: postgres-vfs with bash-tool + Vercel AI SDK (generateText)
 *
 * Non-streaming variant — waits for the whole run to finish, then prints
 * every tool call the agent made and the final generated file. For a
 * streaming version that prints tokens and tool calls as they happen,
 * see bash-tool-demo-stream.ts.
 *
 * Prerequisites:
 *   1. PostgreSQL running with pgvector (docker or local)
 *   2. DATABASE_URL set
 *   3. ANTHROPIC_API_KEY set (or use openai/google)
 *   4. OPENAI_API_KEY set (optional: enables semantic search)
 *
 * Run:
 *   bun add @ai-sdk/anthropic
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres_vfs \
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   bun run examples/bash-tool-demo-generate.ts
 */
import { createClient } from "../src/db/client.ts";
import { createPostgresVfsTool } from "../src/bash-tool/index.ts";
import { generateText, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const sql = createClient();

// 1. Create the bash-tool toolkit backed by Postgres
console.log("Creating postgres-vfs bash-tool toolkit...\n");
const { tools, sandbox } = await createPostgresVfsTool({
  sql,
  tenantId: "bash-tool-demo",
});

// 2. Pre-load some files for the agent to explore
console.log("Loading sample files...\n");
await sandbox.writeFiles([
  {
    path: "/projects/api/src/server.ts",
    content: `import express from "express";
import { Pool } from "pg";

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// TODO: add rate limiting middleware
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/api/users", async (req, res) => {
  // TODO: add pagination support
  const result = await pool.query("SELECT * FROM users");
  res.json(result.rows);
});

app.post("/api/users", async (req, res) => {
  // TODO: validate email format
  const { name, email } = req.body;
  const result = await pool.query(
    "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
    [name, email]
  );
  res.status(201).json(result.rows[0]);
});

app.listen(3000, () => console.log("Server on :3000"));`,
  },
  {
    path: "/projects/api/src/auth.ts",
    content: `import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "changeme";

// TODO: implement refresh token rotation
export function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "1h" });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// TODO: add middleware for route protection
export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid token" });
  req.user = payload;
  next();
}`,
  },
  {
    path: "/projects/api/README.md",
    content: `# API Server

Express REST API with PostgreSQL.

## Endpoints
- GET /api/health - Health check
- GET /api/users - List users
- POST /api/users - Create user

## Auth
JWT-based. Set JWT_SECRET env var.

## TODO
- Rate limiting
- Input validation
- Pagination
- Refresh tokens`,
  },
]);
console.log("Files loaded. Sending prompt to Claude...\n");
console.log("─".repeat(60));

// 3. Let the agent explore and analyze
const { text, steps } = await generateText({
  model: anthropic("claude-sonnet-4-20250514"),
  tools,
  stopWhen: stepCountIs(15),
  system: "You have access to a virtual filesystem backed by PostgreSQL. Use the bash, readFile, and writeFile tools to explore files and complete tasks. Always start by exploring the filesystem structure.",
  prompt:
    "Explore the /projects directory. Find all TODO comments using grep, then write a /projects/api/TODO.md file that organizes them by priority (critical, important, nice-to-have) with the file and line number for each.",
});

// 4. Print what happened
console.log("\n" + "─".repeat(60));
console.log(`\nAgent completed in ${steps.length} steps.\n`);

// Show each tool call (AI SDK v6 uses content[] with type "tool-call")
for (const step of steps) {
  const calls = step.content.filter((c: any) => c.type === "tool-call");
  for (const call of calls) {
    const c = call as any;
    const input = c.input ?? c.args ?? {};
    if (c.toolName === "bash" && input.command) {
      console.log(`  \x1b[36m$ ${input.command}\x1b[0m`);
    } else {
      console.log(`  \x1b[33m${c.toolName}\x1b[0m(${JSON.stringify(input).slice(0, 100)})`);
    }
  }
}

// Show the final generated TODO.md if it was created
console.log("\n" + "─".repeat(60));
try {
  const todoContent = await sandbox.readFile("/projects/api/TODO.md");
  console.log("\nGenerated TODO.md:\n");
  console.log(todoContent);
} catch {
  console.log("\n(Agent did not create TODO.md)");
}

// Show the final text response
if (text) {
  console.log("─".repeat(60));
  console.log("\nAgent response:\n");
  console.log(text);
}

// Cleanup
await sql`DELETE FROM vfs_files WHERE tenant_id = ${"bash-tool-demo"}`;
await sql.end();
