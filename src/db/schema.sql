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
