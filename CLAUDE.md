# Project Conventions

## Overview

postgres-vfs is a virtual filesystem for AI agents backed by PostgreSQL with pgvector.
It exposes a Node.js `fs`-compatible API (`readFile`, `writeFile`, `mkdir`, `stat`, etc.)
on top of Postgres, with full-text search, trigram matching, and optional semantic search
via OpenAI embeddings.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode, ESNext)
- **Database**: PostgreSQL 17 + pgvector via the `postgres` driver
- **Testing**: `bun test`
- **Build**: `bun build`

## Project Structure

- `src/fs/` — Core virtual filesystem (PostgresFs class, search, metadata, embeddings)
- `src/db/` — Database client and migrations
- `src/ui/` — HTTP API and web UI server
- `src/commands/` — CLI commands
- `src/bash-tool/` — Bash tool integration
- `test/` — Test files
- `examples/` — Usage examples

## Code Style

- Use `import` with `.js` extensions for local imports (ESM)
- Prefer `async/await` over raw promises
- Use tagged template literals for SQL queries via the `postgres` driver
- Never expose internal error details (stack traces, SQL errors) to API consumers
- Keep API handler functions in `src/ui/api.ts` and return `Response` objects

## Security

- Never hardcode secrets; use environment variables
- Always parameterize SQL queries (the `postgres` tagged template does this automatically)
- API error responses must return generic user-facing messages; log details server-side

## Testing

- Tests live in `test/` and run with `bun test`
- Tests expect a local PostgreSQL instance with `DATABASE_URL` set
- Run migrations before tests: `bun run migrate`

## postgres-vfs-bot (CI Bot)

This repo uses a custom GitHub App (`postgres-vfs-bot`) for automation:

- **PR Review**: Auto-reviews every new PR targeting `main` for bugs, security, and performance issues
- **Mentions**: Type `@postgres-vfs-bot` in any PR or issue comment to ask for help
- **Triage**: Auto-labels new issues and PRs by category, priority, and area
- **Dedupe**: Detects duplicate issues when new issues are opened
- **Tidy**: Type `/tidy` on a PR to collapse resolved review threads

Bot workflows live in `.github/workflows/vfs-bot-*.yml` with helper scripts in `.github/scripts/`.
