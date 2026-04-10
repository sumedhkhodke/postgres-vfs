# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-04-10

### Added

- PostgresFs: full `IFileSystem` implementation backed by PostgreSQL (`vfs_files` table).
- 75+ bash commands via just-bash with the custom Postgres filesystem backend.
- Three-tier hybrid search: full-text (tsvector), fuzzy/regex (pg_trgm), and optional semantic similarity (pgvector).
- Auto-embedding pipeline: files embedded on write when `OPENAI_API_KEY` is set; graceful degradation without it.
- Multi-tenant isolation via `tenant_id` column and Row-Level Security.
- bash-tool adapter: `createPostgresVfsTool()` factory for drop-in Vercel AI SDK integration.
- Custom shell commands: `search`, `tag`, `untag`, `tags`, `recent`, `summarize`.
- Web UI: three-column file manager with tenant selector, markdown preview, hybrid search, drag-and-drop, and responsive layout.
- REST API for programmatic file operations.
- In-memory caching of path tree, directory listings, and stat data.
- Four runnable demo scripts under `examples/` with swappable seed data.
- Database migration runner (`bun run migrate`).
