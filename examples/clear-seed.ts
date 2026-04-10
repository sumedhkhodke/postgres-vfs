/**
 * Clear seed data left behind by bash-tool-demo-stream.ts.
 *
 * The stream demo cleans up its tenant rows by default at the end of a run,
 * but if you comment that cleanup out (to inspect the VFS between runs, to
 * skip re-seeding while iterating on a prompt, or because a run crashed
 * mid-flight), you'll eventually want to wipe the seed's tenant by hand.
 * That's what this script is for.
 *
 * It deletes both `vfs_files` and `vfs_symlinks` rows for the seed's tenant
 * id, so the next run of the stream demo starts from an empty workspace.
 *
 * Run:
 *   bun run examples/clear-seed.ts meetings    # wipe one seed
 *   bun run examples/clear-seed.ts tickets
 *   bun run examples/clear-seed.ts research
 *   bun run examples/clear-seed.ts contracts
 *   bun run examples/clear-seed.ts all         # wipe every seed tenant
 */
import { createClient } from "../src/db/client.ts";
import type { Seed } from "./seeds/types.ts";
import { seed as meetingsSeed } from "./seeds/meetings.ts";
import { seed as ticketsSeed } from "./seeds/support-tickets.ts";
import { seed as researchSeed } from "./seeds/research-articles.ts";
import { seed as contractsSeed } from "./seeds/contracts.ts";

// Keep this map in sync with the one in bash-tool-demo-stream.ts.
const seeds: Record<string, Seed> = {
  meetings: meetingsSeed,
  tickets: ticketsSeed,
  research: researchSeed,
  contracts: contractsSeed,
};

const target = process.argv[2];
if (!target) {
  console.error(
    `Usage: bun run examples/clear-seed.ts <seed-name|all>\n` +
      `Available seeds: ${Object.keys(seeds).join(", ")}, all`,
  );
  process.exit(1);
}

const targets: Seed[] =
  target === "all"
    ? Object.values(seeds)
    : seeds[target]
      ? [seeds[target]]
      : [];

if (targets.length === 0) {
  console.error(
    `Unknown seed: "${target}". Available: ${Object.keys(seeds).join(", ")}, all`,
  );
  process.exit(1);
}

const sql = createClient();

try {
  let totalFiles = 0;
  let totalSymlinks = 0;

  for (const seed of targets) {
    const filesResult = await sql`
      DELETE FROM vfs_files WHERE tenant_id = ${seed.tenantId}
    `;
    const symlinksResult = await sql`
      DELETE FROM vfs_symlinks WHERE tenant_id = ${seed.tenantId}
    `;

    totalFiles += filesResult.count;
    totalSymlinks += symlinksResult.count;

    console.log(
      `Cleared "${seed.name}" (tenant ${seed.tenantId}): ` +
        `${filesResult.count} file row(s), ${symlinksResult.count} symlink row(s)`,
    );
  }

  if (targets.length > 1) {
    console.log(
      `\nTotal: ${totalFiles} file row(s), ${totalSymlinks} symlink row(s) across ${targets.length} seed(s).`,
    );
  }
} finally {
  await sql.end();
}
