# Contributing to postgres-vfs

Thanks for your interest in contributing! Here's how to get started.

## Opening issues

Before writing code, please [open an issue](https://github.com/sumedhkhodke/postgres-vfs/issues/new) describing the bug or feature. This avoids duplicate work and lets us align on the approach before you invest time.

## Development setup

```bash
# Start PostgreSQL with pgvector
docker run -d --name pgvfs \
  -e POSTGRES_DB=postgres_vfs \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  pgvector/pgvector:pg17

# Clone and install
git clone https://github.com/sumedhkhodke/postgres-vfs.git
cd postgres-vfs
bun install
echo "DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres_vfs" > .env
bun run migrate
```

## Running tests

Tests run against a live Postgres instance. Make sure the database is up and migrated, then:

```bash
bun test
```

All tests must pass before submitting a PR.

## Pull request workflow

1. Fork the repo and create a branch from `main`.
2. Make your changes. Keep commits focused -- one logical change per commit.
3. Add or update tests for any new behavior.
4. Run `bun test` and make sure everything passes.
5. Open a PR against `main` with a clear description of what changed and why.

## Code style

- TypeScript with strict mode.
- No linting config is enforced yet -- just follow the patterns you see in the existing code.
- Avoid adding dependencies unless necessary. If you do, explain why in the PR.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
