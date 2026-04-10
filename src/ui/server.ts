#!/usr/bin/env bun
/**
 * postgres-vfs Web UI
 *
 * Usage:
 *   DATABASE_URL=postgres://... bun run src/ui/server.ts
 *   Open http://localhost:4321
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { handleApi } from "./api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, "index.html"), "utf-8");
const PORT = parseInt(process.env.PORT ?? "4321", 10);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api")) {
      return handleApi(req, url);
    }
    return new Response(HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`postgres-vfs UI running at http://localhost:${server.port}`);
