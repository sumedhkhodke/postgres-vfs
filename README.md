<div align="center">

<img src="diagrams/logo.svg" width="80" alt="postgres-vfs logo">

# postgres-vfs

[![CI](https://github.com/sumedhkhodke/postgres-vfs/actions/workflows/ci.yml/badge.svg)](https://github.com/sumedhkhodke/postgres-vfs/actions/workflows/ci.yml) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/sumedhkhodke/postgres-vfs) [![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-000000?style=flat&logo=bun&logoColor=white)](https://bun.sh) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-%E2%89%A514-316192?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/) [![pgvector](https://img.shields.io/badge/pgvector-optional-4169E1?style=flat&logo=databricks&logoColor=white)](https://github.com/pgvector/pgvector) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue?style=flat&logo=opensourceinitiative&logoColor=white)](LICENSE) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat)](#contributing) [![GitHub last commit](https://img.shields.io/github/last-commit/sumedhkhodke/postgres-vfs?style=flat)](https://github.com/sumedhkhodke/postgres-vfs/commits/main) [![GitHub issues](https://img.shields.io/github/issues/sumedhkhodke/postgres-vfs?style=flat)](https://github.com/sumedhkhodke/postgres-vfs/issues) [![Star History](https://img.shields.io/github/stars/sumedhkhodke/postgres-vfs?style=flat&logo=github&label=Stars)](https://github.com/sumedhkhodke/postgres-vfs/stargazers)

**A virtual filesystem using PostgreSQL for AI agents.**

**See demo: [postgres-vfs.com](https://postgres-vfs.com)**

</div>


A PostgreSQL-backed virtual filesystem for AI agents. Agents run `cat`, `ls`, `grep`, `find`, `mkdir`, `rm`, and 70+ other Unix commands against a persistent, multi-tenant workspace and all data lives in Postgres.

Built on [just-bash](https://github.com/vercel-labs/just-bash) a TypeScript bash interpreter, with a custom `IFileSystem` that compiles every filesystem call into SQL. Inspired by [ChromaFs](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) but it can also read-write and is Postgres-native.

<p align="center"><img src="diagrams/demo.gif" width="760" alt="Terminal demo: an AI agent queries meeting files via bash-tool, using find and grep to locate deadlines across a Postgres-backed virtual filesystem"></p>

<p align="center"><img src="diagrams/db-rows-filesystem.png" width="760" alt="pgAdmin showing vfs_files table rows: directories and markdown files stored as database rows with tenant isolation"></p>

<p align="center"><a id="ui-screenshot"></a><img src="diagrams/ui-screenshot.png" width="760" alt="postgres-vfs Web UI showing the three-column layout: file tree on the left, markdown editor in the middle, and file details on the right."></p>

---

## Why do we need `postgres-vfs`?

Modern LLMs are fluent in shell. They've ingested enormous amounts of `grep`, `find`, `cat`, `sed`, and `awk` during training, which makes a bash tool over a filesystem a surprisingly high-leverage interface for *non-coding* agents too (email, sales, support, docs). `grep` returns exact matches. Directories map to real data hierarchies. Agents load only the context they need, when they need it. See [this note](https://x.com/trq212/status/1982869394482139206) on how swapping custom tools for bash + filesystem cut cost and improved output in production (part of the broader MCP-vs-CLI_with_fs conversation).

But a real filesystem is a poor production substrate for agents:

- **Sandboxing is slow and expensive.** Per-container spin-up takes seconds, and isolated disks add up fast at agent scale.
- **No built-in multi-tenancy.** Isolating agents means managing Unix users, chroots, or per-session containers.
- **`grep -r` is linear.** Byte-scanning thousands of files doesn't scale as workspaces grow.
- **State is ephemeral in a sandbox** Files die with the sandbox unless you bolt on volumes, and backup/restore is per-box.
- **No indexed search in a regular filesystem** It doesnt have FTS, trigram, no vectors. Every agent reinvents retrieval on top of raw files.

> `postgres-vfs` collapses bash + filesystem onto a single Postgres table. Agents keep their native `grep` / `cat` / `find` workflow. Isolation is row-level. Search is indexed (FTS + trigram + optional pgvector). State persists across sessions. A new workspace spins up in milliseconds.

---

## Table of Contents

1. **[Getting Started](#1-getting-started)**
   - [Prerequisites](#prerequisites)
   - [Quick start (Docker)](#quick-start-docker)
   - [Manual setup](#manual-setup)

2. **[Features](#2-features)**

3. **[Architecture](#3-architecture)**
   - [Layered stack](#31-layered-stack)
   - [Request flow](#32-request-flow)
   - [PostgresFs and IFileSystem](#33-postgresfs-and-ifilesystem)
   - [Search engine](#34-search-engine)
   - [Two-stage grep](#35-two-stage-grep)
   - [Caching](#36-caching)
   - [Embeddings pipeline](#37-embeddings-pipeline)
   - [VFS vs native filesystem](#38-vfs-vs-native-filesystem)

4. **[Database](#4-database)**
   - [Schema](#41-schema)
   - [Multi-tenancy (RLS)](#42-multi-tenancy-rls)
   - [Migrations](#43-migrations)

5. **[Agent Integration](#5-agent-integration)**
   - [bash-tool adapter](#51-bash-tool-adapter)
   - [createPostgresVfsTool API](#52-createpostgresvfstool-api)
   - [Examples](#53-examples)
   - [Custom shell commands](#54-custom-shell-commands)

6. **[Web UI](#6-web-ui)**
   - [Running the UI](#61-running-the-ui)
   - [Features](#62-features)
   - [REST API](#63-rest-api)

7. **[Reference](#7-reference)**
   - [Environment variables](#71-environment-variables)
   - [Scripts](#72-scripts)
   - [Supported file types](#73-supported-file-types)
   - [Project structure](#74-project-structure)
   - [Dependencies](#75-dependencies)

8. **[Testing](#8-testing)**

9. **[Scope and Limitations](#9-scope-and-limitations)**

10. **[Glossary](#10-glossary)**

11. **[Contributing](#contributing)**

## 1. Getting Started

Install Bun, start a Postgres instance with the right extensions, and run the migrations.

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- PostgreSQL ≥ 14 with [pgvector](https://github.com/pgvector/pgvector) (pgvector is only required if you want semantic search)

### Quick start (Docker)

```bash
# Start PostgreSQL with pgvector
docker run -d --name pgvfs \
  -e POSTGRES_DB=postgres_vfs \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  pgvector/pgvector:pg17

# Clone, install, configure, migrate
git clone https://github.com/sumedhkhodke/postgres-vfs.git
cd postgres-vfs
bun install
echo "DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres_vfs" > .env
bun run migrate
```

If everything worked, you should see:

```
Migrating database...
Migration complete.
```

### Manual setup

```bash
# Create the database and install extensions
createdb postgres_vfs
psql -d postgres_vfs -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Configure, install, migrate
echo "DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres_vfs" > .env
bun install
bun run migrate

# Launch the Web UI
bun run ui
```

You should see:

```
postgres-vfs UI running at http://localhost:4321
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

---

## 2. Features

- **75+ bash commands.** `grep`, `sed`, `awk`, `jq`, `find`, `sort`, `wc`, pipes, redirections, variables, loops. All backed by Postgres.
- **Three-tier search.** Full-text (tsvector), fuzzy/regex (pg_trgm), and optional semantic similarity (pgvector).
- **Auto-embedding pipeline.** Files are embedded on write and queries use vector similarity when `OPENAI_API_KEY` is set; silently degrades without it.
- **Multi-tenant isolation.** Row-Level Security guarantees each agent only sees its own files.
- **bash-tool integration.** Drop-in compatibility with [bash-tool](https://github.com/vercel-labs/bash-tool).
- **Web UI.** Three-column file manager for browsing, editing, searching, and tagging.
- **In-memory caching.** Path tree, directory listings, and stat data cached on init for sub-millisecond lookups.
- **Persistent across sessions.** Files survive restarts; agent state carries over.

---

## 3. Architecture

Four layers between the agent and the database. Each layer knows only the interface above it.

### 3.1 Layered stack

<p align="center"><img src="diagrams/layered-stack.png" width="760" alt="Layered stack: AI Agent → bash-tool → just-bash → PostgresFs → PostgreSQL"></p>

<p align="center"><em>Figure 1: Four layers between the agent and the database.</em></p>

### 3.2 Request flow

The agent sees three tools: `bash({ command })`, `readFile({ path })`, and `writeFile({ path, content })`.

When the agent calls `bash({ command: "grep -rn TODO /projects" })`, the call walks down the stack, turns into SQL at the bottom, and the result walks back up.

At a high level, a natural-language prompt maps to code entities across four layers (natural language → agent interface → code entities → persistence):

<p align="center"><img src="diagrams/request-flow.png" width="760" alt="Request flow: Natural Language → Agent Interface → Code → Persistence"></p>

<p align="center"><em>Figure 2: Prompt → agent interface → code entities → persistence.</em></p>

Concretely, here's what `grep -rn TODO /projects` compiles to at the bottom of the stack, i.e. the SQL that actually runs against Postgres:

```sql
-- IFileSystem.readdir('/projects') becomes:
SELECT path FROM vfs_files
WHERE tenant_id = 'agent-123'
  AND path LIKE '/projects/%'
  AND path NOT LIKE '/projects/%/%';

-- IFileSystem.readFile('/projects/src/server.ts') becomes:
SELECT content FROM vfs_files
WHERE tenant_id = 'agent-123'
  AND path = '/projects/src/server.ts';
```

Postgres returns the rows, just-bash's `grep` runs the regex on the content and emits matching lines to stdout, and the agent sees the result of its tool call. The agent never sees SQL. just-bash never sees Postgres. Each layer is replaceable.

### 3.3 PostgresFs and IFileSystem

`IFileSystem` is a ~20-method TypeScript contract from just-bash. Implement it and you can run bash against any backing store. The default implementation uses a JS `Map`; ours uses Postgres.

```typescript
interface IFileSystem {
  readFile(path): Promise<string>;
  writeFile(path, content): Promise<void>;
  readdir(path): Promise<string[]>;
  stat(path): Promise<FsStat>;
  mkdir(path): Promise<void>;
  rm(path): Promise<void>;
  exists(path): Promise<boolean>;
  // + cp, mv, symlink, chmod, link, utimes, etc.
}
```

just-bash thinks it's talking to a filesystem. It's actually talking to a database.

### 3.4 Search engine

The `search` command fans out to FTS, trigram, and (optionally) pgvector in parallel, then combines their scores with a weighted formula.

<p align="center"><img src="diagrams/search-engine.png" width="760" alt="Search engine: query → generateEmbedding → hybridSearch → tsvector + pg_trgm + pgvector → weighted score → ranked results"></p>

### 3.5 Two-stage grep

`grep -r` across thousands of files completes in milliseconds because it runs in two stages:

1. **Coarse filter in Postgres:** `WHERE content ~ 'pattern'` uses the pg_trgm GIN index to drop non-matching files instantly.
2. **Fine filter in JS:** precise line-by-line regex on the candidate set, with line numbers.

### 3.6 Caching

On `init()`, PostgresFs loads the complete path tree into memory:

- `Set<string>` of all paths → `exists()` is O(1).
- `Map<string, string[]>` of directory children → `readdir()` is O(1).
- `Map<string, CachedStat>` of file metadata → `stat()` is O(1).

Writes invalidate the cache surgically (only affected paths), so reads stay fast during active use.

### 3.7 Embeddings pipeline

When `OPENAI_API_KEY` is set, file writes trigger a fire-and-forget `embedFile()` call that stores a vector in the `embedding` column. Search queries are embedded too, enabling semantic matches in `hybridSearch()`. When the key isn't set, embedding calls return `null`, search falls back to FTS + trigram, and no API calls are made.

### 3.8 VFS vs native filesystem

`postgres-vfs` and the agent's native filesystem are separate systems that coexist. `/projects/foo.ts` in the VFS is a row in Postgres, not a file on disk.

| | Agent's native filesystem | postgres-vfs |
|---|---|---|
| **Storage** | Your actual disk | PostgreSQL `vfs_files` table |
| **Access** | Built-in tools (Read, Edit, Bash) | bash-tool tools (bash, readFile, writeFile) |
| **Scope** | Everything on your machine | Isolated per tenant |
| **Search** | Sequential file scan | FTS index + trigram index + optional vector |
| **Security** | Agent can read/write anything allowed | Agent can only see its own tenant's files |
| **Persistence** | Until you delete the file | Until you delete the row |

---

## 4. Database

Everything lives in two tables: `vfs_files` for regular files and directories, `vfs_symlinks` for symlinks. Isolation, search, and backup are all just Postgres features.

### 4.1 Schema

```sql
CREATE TABLE vfs_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  path        TEXT NOT NULL,
  is_dir      BOOLEAN NOT NULL DEFAULT FALSE,
  content     TEXT,
  mode        INTEGER NOT NULL DEFAULT 33188,  -- 0o100644
  summary     TEXT,
  tags        TEXT[] DEFAULT '{}',
  size        INTEGER GENERATED ALWAYS AS (octet_length(coalesce(content, ''))) STORED,
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED,
  embedding   VECTOR(1536),           -- optional: for semantic search
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, path)
);

-- Indexes
CREATE INDEX idx_vfs_path_prefix ON vfs_files (tenant_id, path text_pattern_ops);
CREATE INDEX idx_vfs_fts ON vfs_files USING GIN (content_tsv);
CREATE INDEX idx_vfs_trgm ON vfs_files USING GIN (content gin_trgm_ops);
CREATE INDEX idx_vfs_embedding ON vfs_files USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_vfs_tags ON vfs_files USING GIN (tags);
```

Symlinks live in a separate `vfs_symlinks` table.

### 4.2 Multi-tenancy (RLS)

Every operation is scoped to a `tenant_id`. Row-Level Security enforces the boundary at the database layer, so two tenants can't see each other's files even at the SQL level.

```bash
# Alice's workspace
TENANT_ID=alice bun run ui

# Bob's workspace (can't see Alice's files)
TENANT_ID=bob bun run ui
# Error: no such file or directory
```

No Unix users, no chroots, no per-session containers. One SQL predicate per query.

### 4.3 Migrations

The schema lives in `src/db/schema.sql`. Apply it with:

```bash
bun run migrate
```

The migration runner is idempotent, so it's safe to re-run after pulling schema changes.

---

## 5. Agent Integration

`postgres-vfs` plugs into Agent SDK agents via bash-tool. You get three tools (`bash`, `readFile`, `writeFile`) that behave like a normal sandboxed shell from the model's perspective.

### 5.1 bash-tool adapter

`createPostgresVfsTool()` returns a ready-to-use bash-tool toolkit scoped to a tenant. Drop it into `generateText`, `streamText`, or `ToolLoopAgent`.

### 5.2 createPostgresVfsTool API

```typescript
import { createClient } from "postgres-vfs";
import { createPostgresVfsTool } from "postgres-vfs";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const sql = createClient("postgres://...");

const { tools } = await createPostgresVfsTool({
  sql,
  tenantId: "my-agent",
});

// tools contains: bash, readFile, writeFile
const { text } = await generateText({
  model: anthropic("claude-sonnet-4-20250514"),
  tools,
  maxSteps: 10,
  prompt: "Find all TODO comments in /projects and summarize them",
});
```

### 5.3 Examples

Works with `ToolLoopAgent` just as well:

```typescript
import { ToolLoopAgent } from "ai";

const agent = new ToolLoopAgent({
  model: anthropic("claude-sonnet-4-20250514"),
  tools,
});

const result = await agent.generate({
  prompt: "Explore /docs and find information about authentication",
});
```

Access the sandbox directly to pre-load files before the agent runs:

```typescript
const { tools, sandbox } = await createPostgresVfsTool({ sql, tenantId: "my-agent" });

// Pre-load files before the agent starts
await sandbox.writeFiles([
  { path: "/docs/guide.md", content: guideMarkdown },
  { path: "/docs/api.md", content: apiReference },
]);

// Now the agent can explore them
const { text } = await generateText({ model, tools, prompt: "Summarize the API docs" });
```

#### Runnable demos

Four end-to-end scripts live under `examples/`.

**`bash-tool-demo-generate.ts`** uses `generateText` (non-streaming). Waits for the whole run, then prints every tool call and the final artifact.

**`bash-tool-demo-stream.ts`** uses `streamText` (streaming). Prints text deltas, tool calls, and tool results as they arrive. Ships with four non-coding use cases as swappable seeds under `examples/seeds/`:

```bash
bun run examples/bash-tool-demo-stream.ts meetings    # meeting notes → action items (default)
bun run examples/bash-tool-demo-stream.ts tickets     # support ticket triage
bun run examples/bash-tool-demo-stream.ts research    # literature review
bun run examples/bash-tool-demo-stream.ts contracts   # contract risk review
```

Each seed bundles the pre-loaded files, system + user prompts, tenant id, and output path in one module. Adding a new use case is a single file under `examples/seeds/` plus one line in the stream demo's seed map.

**`bash-tool-demo-query.ts`** runs an ad-hoc streaming query against an **existing** tenant. Does not seed any files, so you can iterate on prompts against an already-populated workspace (a previous seed run, your own application data, etc.) without re-seeding each time. Tenant id, user prompt, and system prompt are CLI flags; long prompts can be loaded from a file with `@path` syntax:

```bash
# Query an existing seeded tenant
bun run examples/bash-tool-demo-query.ts \
  --tenant bash-tool-demo-meetings \
  --prompt "Who has the most action items and why?"

# Custom system prompt; load both prompts from files
bun run examples/bash-tool-demo-query.ts \
  --tenant my-workspace \
  --system @prompts/security-auditor.txt \
  --prompt @prompts/task.txt
```

Run with `--help` for the full flag list (`--model`, `--max-steps`, short aliases `-t`/`-p`/`-s`).

**`clear-seed.ts`** wipes the tenant rows for one seed (or `all`) when you've commented out the stream demo's built-in cleanup and want to reset between iterations:

```bash
bun run examples/clear-seed.ts meetings
bun run examples/clear-seed.ts all
```

### 5.4 Custom shell commands

Beyond the 75+ standard bash commands, postgres-vfs adds a few that are database-native.

**`search`** runs a hybrid search combining FTS, trigram, and vector similarity into one ranked query.

```bash
search authentication             # finds files discussing auth
search "database connection" --limit 5
```

**`tag` / `untag` / `tags`** let you attach tags to files and query by tag.

```bash
tag /src/server.ts backend        # add a tag
tag /src/database.ts backend
tag /src/database.ts database
tags backend                      # find files by tag
# /src/database.ts
# /src/server.ts
untag /src/server.ts backend      # remove a tag
```

**`recent`** lists recently modified files, newest first.

```bash
recent 10                         # last 10 modified files
```

**`summarize`** sets a human-readable summary that boosts search relevance.

```bash
summarize /src/server.ts "Express HTTP server with CRUD endpoints"
search server endpoints           # summary boosts this file in results
```

---

## 6. Web UI

<p align="center"><a href="#ui-screenshot"><em>See the Web UI screenshot above.</em></a></p>

A three-column file manager for browsing, editing, searching, and tagging the VFS. Useful for inspecting what an agent has done without writing SQL.

### 6.1 Running the UI

```bash
bun run ui
# Open http://localhost:4321
```

### 6.2 Features

- **Three-column layout:** file tree, code viewer with line numbers, detail panel with metadata/tags/summary.
- **Tenant selector** to switch between isolated agent workspaces.
- **File operations** including create, edit, rename, delete files and folders.
- **Upload and drag-drop.** Upload local files or drag to move them between directories.
- **Hybrid search** with full-text + fuzzy results from the search bar.
- **Markdown preview** with a Raw/Preview toggle for `.md` files (headings, lists, code blocks, and task lists).
- **Tags and summaries** editable from the detail panel.
- **State persistence.** Tenant, expanded folders, and selected file survive refresh via localStorage.
- **Responsive.** Mobile-friendly with slide-in sidebar and detail panel overlays.
- **Breadcrumbs** for clickable path segments and parent navigation.

### 6.3 REST API

The UI server exposes a REST API for programmatic file operations. _See [REST API Reference](https://deepwiki.com/sumedhkhodke/postgres-vfs/19-rest-api-reference) for the full endpoint list._

---

## 7. Reference

### 7.1 Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://localhost:5432/postgres_vfs` | PostgreSQL connection string |
| `TENANT_ID` | `default` | Default tenant for the web UI |
| `PORT` | `4321` | Web UI server port |
| `OPENAI_API_KEY` | (none) | Optional: enables the embedding pipeline (semantic search) |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Optional: OpenAI embedding model |

### 7.2 Scripts

```bash
bun run ui        # Web UI at http://localhost:4321
bun run migrate   # Run database migrations
bun test          # Run all tests
bun run build     # Build for distribution
```

### 7.3 Supported file types

The VFS stores content as Postgres `TEXT`. Any valid UTF-8 text file works. Binary files (null bytes) are not supported.

| Category | Extensions | Supported |
|----------|-----------|-----------|
| **Code** | `.ts`, `.js`, `.jsx`, `.tsx`, `.py`, `.go`, `.rs`, `.java`, `.c`, `.cpp`, `.h`, `.rb`, `.php`, `.swift`, `.kt`, `.sh` | Yes |
| **Markup** | `.html`, `.xml`, `.svg`, `.vue`, `.svelte` | Yes |
| **Styles** | `.css`, `.scss`, `.sass`, `.less` | Yes |
| **Data** | `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.env`, `.csv`, `.tsv` | Yes |
| **Docs** | `.md`, `.mdx`, `.txt`, `.rst`, `.tex` | Yes |
| **Config** | `.gitignore`, `.dockerignore`, `.editorconfig`, `Makefile`, `Dockerfile`, `.tf` | Yes |
| **SQL** | `.sql` | Yes |
| **Binary** | `.pdf`, `.png`, `.jpg`, `.gif`, `.zip`, `.exe`, `.wasm`, `.mp3`, `.mp4` | No |

### 7.4 Project structure

A quick map of what lives where. Library code, tests, and the Web UI each have their own directory under `src/`.

```
postgres-vfs/
├── src/
│   ├── index.ts              # Library exports
│   ├── utils.ts              # Shared utilities
│   ├── db/
│   │   ├── schema.sql        # PostgreSQL schema + indexes + extensions
│   │   ├── migrate.ts        # Migration runner
│   │   └── client.ts         # postgres.js client wrapper
│   ├── fs/
│   │   ├── postgres-fs.ts    # IFileSystem implementation (20 methods)
│   │   ├── search.ts         # FTS + trigram + optional vector search
│   │   ├── metadata.ts       # Tags, summaries, embeddings
│   │   ├── embeddings.ts     # Auto-embedding via OpenAI (optional)
│   │   └── path-utils.ts     # Path normalization utilities
│   ├── commands/
│   │   └── index.ts          # Custom commands (search, tag, recent, etc.)
│   ├── bash-tool/
│   │   ├── adapter.ts        # Sandbox adapter (PostgresFs → bash-tool)
│   │   └── index.ts          # createPostgresVfsTool() factory
│   └── ui/
│       ├── server.ts          # Web UI HTTP server
│       ├── api.ts             # API route handlers
│       └── index.html         # Single-page frontend (vanilla JS)
├── test/
│   ├── fs.test.ts            # PostgresFs unit tests
│   ├── bash-tool.test.ts     # bash-tool adapter tests
│   ├── path-utils.test.ts    # Path utility tests
│   └── commands.test.ts      # Custom command tests
├── package.json
├── tsconfig.json
└── .env.example
```

### 7.5 Dependencies

| Package | Purpose |
|---------|---------|
| [just-bash](https://github.com/vercel-labs/just-bash) | TypeScript bash interpreter with pluggable filesystem |
| [bash-tool](https://github.com/vercel-labs/bash-tool) | AI SDK bash/readFile/writeFile tools |
| [postgres](https://github.com/porsager/postgres) | PostgreSQL client for Bun/Node |
| [pgvector](https://github.com/pgvector/pgvector-node) | Vector type support for optional semantic search |

---

## 8. Testing

Tests run against a live Postgres. Start a throwaway instance, migrate, then `bun test`.

```bash
# Start PostgreSQL (if not running)
docker run -d --name pgvfs-test \
  -e POSTGRES_DB=postgres_vfs -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 pgvector/pgvector:pg17

# Run migrations and tests
bun run migrate
bun test
```

```
 All pass
 0 fail
Ran tests across 4 files.
```

---

## 9. Scope and Limitations

just-bash is a pure TypeScript interpreter over an in-memory `IFileSystem`. It only implements commands that operate on the virtual filesystem. It has no network stack and cannot reach the host OS to spawn `curl` or any other binary.

The 75+ supported commands are filesystem and text utilities (`grep`, `sed`, `awk`, `jq`, `find`, `sort`, `wc`, pipes, redirects, etc.). Anything that requires sockets, subprocesses, or hardware (`curl`, `wget`, `ssh`, `git`, `docker`, `python`) is out of scope by design.

> **Need HTTP?** Expose `fetch` as a separate AI SDK tool alongside `createPostgresVfsTool`'s `bash` / `readFile` / `writeFile`. The model uses `bash` for workspace work and the dedicated `fetch` tool for network calls, keeping the VFS sandboxed from the outside world.

---

## 10. Glossary

- **bash-tool:** Toolkit exposing `bash`, `readFile`, and `writeFile` as AI SDK tools.
- **just-bash:** TypeScript bash interpreter with a pluggable `IFileSystem` backend; parses commands, pipes, redirects, and globs.
- **IFileSystem:** the ~20-method TypeScript interface just-bash calls; `PostgresFs` implements it against Postgres.
- **PostgresFs:** this repo's `IFileSystem` implementation. Every filesystem op becomes a SQL query.
- **Sandbox adapter:** the thin layer that bridges bash-tool's tool calls to `PostgresFs`.
- **Tenant:** an isolation boundary (one agent or user). Scoped via `tenant_id` column and row-level security.
- **RLS (Row-Level Security):** Postgres feature that enforces per-tenant row visibility at the database layer.
- **FTS (Full-Text Search):** Postgres `tsvector` + `websearch_to_tsquery` indexed lexical search.
- **pg_trgm:** Postgres trigram extension. Powers fuzzy and regex matching via a GIN index.
- **pgvector:** Postgres extension adding a `vector` type and similarity operators. Optional in this project.
- **HNSW:** Hierarchical Navigable Small World, the approximate-nearest-neighbor index pgvector uses for fast vector search.
- **Hybrid search:** weighted combination of FTS + trigram + optional vector in a single ranked query.
- **Embedding:** a dense float vector representing file content semantically. Generated on write when `OPENAI_API_KEY` is set.
- **Two-stage grep:** coarse filter in Postgres (trigram index) followed by precise regex in JS. Makes `grep -r` fast at scale.
- **Workspace:** a tenant's private filesystem. Spins up in milliseconds because it's just a `tenant_id`, not a container.

## Acknowledgments

- [ChromaFs](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) for the virtual filesystem concept
- [just-bash](https://github.com/vercel-labs/just-bash) for the sandboxed bash interpreter
- [agent-vfs](https://github.com/johannesmichalke/agent-vfs) for prior art taste on database-backed agent filesystems

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change, then submit a pull request.

## License

[Apache-2.0](LICENSE)
