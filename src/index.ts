// postgres-vfs: Virtual filesystem for AI agents backed by PostgreSQL

// Core
export { PostgresFs, type DirentEntry } from "./fs/postgres-fs.js";

// Database
export { createClient, type DbClient } from "./db/client.js";

// Path utilities
export { normalizePath, parentDir, basename, ancestors, escapeLike } from "./fs/path-utils.js";

// Search
export {
  grepFiles,
  ftsSearch,
  fuzzySearch,
  semanticSearch,
  hybridSearch,
  type GrepResult,
  type SearchResult,
} from "./fs/search.js";

// Metadata (tags, summaries, embeddings)
export {
  updateEmbedding,
  updateSummary,
  addTag,
  removeTag,
  findByTag,
  recentFiles,
} from "./fs/metadata.js";

// bash-tool integration (primary agent interface)
export {
  createPostgresVfsTool,
  createPostgresSandbox,
  type CreatePostgresVfsToolOptions,
  type PostgresVfsSandboxOptions,
} from "./bash-tool/index.js";

// Embeddings (optional: requires OPENAI_API_KEY)
export { generateEmbedding, embedFile, isEmbeddingEnabled } from "./fs/embeddings.js";

// Utilities
export { errorMessage, toVectorLiteral } from "./utils.js";
