/**
 * postgres-vfs Demo
 *
 * Demonstrates the virtual filesystem using the bash-tool sandbox.
 *
 * Usage:
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres_vfs bun run demo.ts
 */
import { createClient } from "./src/db/client.ts";
import { createPostgresSandbox } from "./src/bash-tool/adapter.ts";

const sql = createClient();
const sandbox = await createPostgresSandbox({ sql, tenantId: "demo" });

async function run(cmd: string) {
  console.log(`\n\x1b[36m$ ${cmd}\x1b[0m`);
  const r = await sandbox.executeCommand(cmd);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(`\x1b[31m${r.stderr}\x1b[0m`);
}

// Create a project structure
console.log("\x1b[1;33m=== CREATE PROJECT ===\x1b[0m");
await sandbox.writeFiles([
  { path: "/projects/api/src/server.ts", content: `import express from "express";\n\nconst app = express();\n\n// TODO: add rate limiting\napp.get("/api/health", (req, res) => {\n  res.json({ status: "ok" });\n});\n\napp.listen(3000);` },
  { path: "/projects/api/src/database.ts", content: `import { Pool } from "pg";\n\nconst pool = new Pool();\n\nexport async function getUsers() {\n  return pool.query("SELECT * FROM users");\n}` },
  { path: "/projects/api/README.md", content: `# API Server\nAn Express API.\n\n## Setup\nnpm install && npm run dev` },
  { path: "/notes/ideas.md", content: `# Ideas\n- Real-time notifications\n- Dark mode\n- Export to PDF` },
  { path: "/notes/todo.md", content: `# TODO\n- [ ] Fix auth bug\n- [ ] Add tests\n- [x] Deploy v1` },
]);
console.log("  Wrote 5 files.");

// Explore
console.log("\n\x1b[1;33m=== EXPLORE ===\x1b[0m");
await run("find / -type f");
await run("ls /projects/api/src");

// Grep
console.log("\n\x1b[1;33m=== GREP ===\x1b[0m");
await run("grep -rn TODO /projects");

// Search
console.log("\n\x1b[1;33m=== SEARCH ===\x1b[0m");
await run("search database");

// Pipelines
console.log("\n\x1b[1;33m=== PIPELINES ===\x1b[0m");
await run("find / -name '*.ts' -type f | wc -l");
await run("cat /projects/api/src/server.ts | grep 'app\\.'");

// Tags
console.log("\n\x1b[1;33m=== TAGS ===\x1b[0m");
await run("tag /projects/api/src/server.ts backend");
await run("tag /projects/api/src/database.ts backend");
await run("tags backend");

// Recent
console.log("\n\x1b[1;33m=== RECENT ===\x1b[0m");
await run("recent 5");

// Read a file
console.log("\n\x1b[1;33m=== READ FILE ===\x1b[0m");
await run("cat /notes/todo.md");

// Cleanup
await sql`DELETE FROM vfs_files WHERE tenant_id = ${"demo"}`;
await sql`DELETE FROM vfs_symlinks WHERE tenant_id = ${"demo"}`;
await sql.end();
console.log("\n\x1b[32mDemo complete. Cleaned up.\x1b[0m");
