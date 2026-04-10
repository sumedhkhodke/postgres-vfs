/**
 * Shared shape for streaming-demo seeds.
 *
 * Each seed file in this folder exports a `seed: Seed` that bundles everything
 * the demo needs to run: pre-loaded files, system + user prompts, and the
 * output path the demo reads back at the end. Adding a new use case is a
 * matter of dropping a new file next to these and registering it in the
 * demo's seed map.
 */
export interface Seed {
  /** Short identifier, used for logging and as the CLI argument. */
  name: string;
  /** One-line description of the use case. */
  description: string;
  /** Postgres VFS tenant id — kept unique per seed to avoid cross-pollution. */
  tenantId: string;
  /** Files to pre-load into the VFS before the agent runs. */
  files: Array<{ path: string; content: string }>;
  /** System message passed to the model. */
  systemPrompt: string;
  /** User prompt passed to the model. */
  userPrompt: string;
  /** Path the demo reads back at the end to show the generated artifact. */
  outputPath: string;
}
