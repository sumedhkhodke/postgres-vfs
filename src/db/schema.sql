-- postgres-vfs: Virtual filesystem schema
-- Requires: pg_trgm extension; pgvector optional (for semantic search)

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vfs_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  path        TEXT NOT NULL,
  is_dir      BOOLEAN NOT NULL DEFAULT FALSE,
  content     TEXT,
  mode        INTEGER NOT NULL DEFAULT 33188,  -- 0o100644 (regular file)
  summary     TEXT,
  tags        TEXT[] DEFAULT '{}',
  size        INTEGER GENERATED ALWAYS AS (octet_length(coalesce(content, ''))) STORED,
  content_tsv TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content, ''))
  ) STORED,
  embedding   VECTOR(1536),           -- optional: set via updateEmbedding() for semantic search
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, path)
);

-- Symlinks stored separately for clean separation
CREATE TABLE IF NOT EXISTS vfs_symlinks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  path        TEXT NOT NULL,
  target      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, path)
);

-- Path prefix queries (ls, find, readdir)
CREATE INDEX IF NOT EXISTS idx_vfs_path_prefix ON vfs_files (tenant_id, path text_pattern_ops);

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_vfs_fts ON vfs_files USING GIN (content_tsv);

-- Trigram grep (regex/fuzzy matching on content)
CREATE INDEX IF NOT EXISTS idx_vfs_trgm ON vfs_files USING GIN (content gin_trgm_ops);

-- Vector similarity search (optional: HNSW for datasets with embeddings)
CREATE INDEX IF NOT EXISTS idx_vfs_embedding ON vfs_files USING hnsw (embedding vector_cosine_ops);

-- Tag queries
CREATE INDEX IF NOT EXISTS idx_vfs_tags ON vfs_files USING GIN (tags);

-- Directory listing optimization
CREATE INDEX IF NOT EXISTS idx_vfs_dir ON vfs_files (tenant_id, is_dir) WHERE is_dir = TRUE;

-- Symlink lookup
CREATE INDEX IF NOT EXISTS idx_vfs_symlinks ON vfs_symlinks (tenant_id, path text_pattern_ops);

-- Backfill updated_at for existing vfs_symlinks tables (idempotent)
ALTER TABLE vfs_symlinks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Updated_at trigger for automatic timestamp
CREATE OR REPLACE FUNCTION vfs_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vfs_files_updated_at ON vfs_files;
CREATE TRIGGER vfs_files_updated_at
  BEFORE UPDATE ON vfs_files
  FOR EACH ROW EXECUTE FUNCTION vfs_update_timestamp();

DROP TRIGGER IF EXISTS vfs_symlinks_updated_at ON vfs_symlinks;
CREATE TRIGGER vfs_symlinks_updated_at
  BEFORE UPDATE ON vfs_symlinks
  FOR EACH ROW EXECUTE FUNCTION vfs_update_timestamp();

-- ---------------------------------------------------------------------------
-- Row-Level Security: defense-in-depth tenant isolation (issue #32)
-- ---------------------------------------------------------------------------

-- Restricted role the app assumes per-transaction (via SET LOCAL ROLE) so RLS
-- policies bind. NOLOGIN: only ever reached via SET ROLE, never a direct login.
-- No BYPASSRLS. Owner/superuser keep their bypass for migrations + admin.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vfs_app') THEN
    CREATE ROLE vfs_app NOLOGIN;
  END IF;
END $$;

-- The migrating/owner role must be able to SET ROLE vfs_app. Superusers always
-- can; a non-superuser owner needs a membership grant with the SET option.
-- On PostgreSQL 16+, CREATE ROLE by a non-superuser auto-grants the creator an
-- ADMIN-only membership (SET and INHERIT false), so "skip if a membership
-- exists" would leave the owner unable to SET ROLE. Grant SET explicitly; on
-- 16+ re-granting just updates the options, so this stays idempotent.
DO $$ BEGIN
  IF current_setting('server_version_num')::int >= 160000 THEN
    EXECUTE format('GRANT vfs_app TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_auth_members am
    JOIN pg_roles r ON r.oid = am.roleid AND r.rolname = 'vfs_app'
    WHERE am.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  ) THEN
    EXECUTE format('GRANT vfs_app TO %I', current_user);
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO vfs_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON vfs_files    TO vfs_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON vfs_symlinks TO vfs_app;

-- ENABLE (not FORCE): owner/superuser keep their bypass for admin + migrations.
ALTER TABLE vfs_files    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vfs_symlinks ENABLE ROW LEVEL SECURITY;

-- Unset GUC -> current_setting(...,true) is NULL -> predicate NULL -> deny-all.
DROP POLICY IF EXISTS tenant_isolation ON vfs_files;
CREATE POLICY tenant_isolation ON vfs_files
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation ON vfs_symlinks;
CREATE POLICY tenant_isolation ON vfs_symlinks
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
