/**
 * Demo: postgres-vfs with bash-tool + Vercel AI SDK (streamText)
 *
 * Streaming variant — prints text deltas, tool calls, and tool results as
 * they arrive from the model instead of waiting for the whole run to finish.
 * For a non-streaming version that collects everything first, see
 * bash-tool-demo-generate.ts.
 *
 * Use cases live as standalone modules under ./seeds/. Pick one at the
 * command line:
 *
 *   bun run examples/bash-tool-demo-stream.ts meetings    # meeting notes → action items (default)
 *   bun run examples/bash-tool-demo-stream.ts tickets     # support ticket triage
 *   bun run examples/bash-tool-demo-stream.ts research    # literature review
 *   bun run examples/bash-tool-demo-stream.ts contracts   # contract risk review
 *
 * To add a new use case: drop a new file next to ./seeds/meetings.ts that
 * exports a `seed: Seed`, then register it in the `seeds` map below.
 *
 * Prerequisites:
 *   1. PostgreSQL running with pgvector (docker or local)
 *   2. DATABASE_URL set
 *   3. ANTHROPIC_API_KEY set (or use openai/google)
 *   4. OPENAI_API_KEY set (optional: enables semantic search)
 *
 * Run:
 *   bun add @ai-sdk/anthropic
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres_vfs \
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   bun run examples/bash-tool-demo-stream.ts [seed-name]
 */
import { createClient } from "../src/db/client.ts";
import { createPostgresVfsTool } from "../src/bash-tool/index.ts";
import { streamText, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { Seed } from "./seeds/types.ts";
import { seed as meetingsSeed } from "./seeds/meetings.ts";
import { seed as ticketsSeed } from "./seeds/support-tickets.ts";
import { seed as researchSeed } from "./seeds/research-articles.ts";
import { seed as contractsSeed } from "./seeds/contracts.ts";

// Register every available seed here. Adding a new use case is a matter of
// creating a new file under ./seeds/ and adding one line below.
const seeds: Record<string, Seed> = {
  meetings: meetingsSeed,
  tickets: ticketsSeed,
  research: researchSeed,
  contracts: contractsSeed,
};

const seedName = process.argv[2] ?? "meetings";
const seed = seeds[seedName];
if (!seed) {
  console.error(
    `Unknown seed: "${seedName}". Available: ${Object.keys(seeds).join(", ")}`,
  );
  process.exit(1);
}

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const sql = createClient();

// 1. Create the bash-tool toolkit backed by Postgres
console.log(
  `Creating postgres-vfs bash-tool toolkit for seed "${seed.name}"...\n`,
);
const { tools, sandbox } = await createPostgresVfsTool({
  sql,
  // tenantId: "demo-ui",
  tenantId: seed.tenantId,
});

// 2. Pre-load the seed files into the virtual filesystem
console.log(`Loading ${seed.files.length} files: ${seed.description}\n`);
await sandbox.writeFiles(seed.files);
console.log("Files loaded. Streaming response from Claude...\n");
console.log("─".repeat(60));

// 3. Stream the agent's exploration. `streamText` returns immediately with
// an async-iterable `fullStream` that yields every event as it happens:
// text deltas, tool-call events, tool-result events, step boundaries, etc.
const result = streamText({
  model: anthropic("claude-sonnet-4-20250514"),
  tools,
  stopWhen: stepCountIs(15),
  system: seed.systemPrompt,
  prompt: seed.userPrompt,
  // system:"you are a demo-ui agent",
  // prompt:"what files do you have?"
});

// 4. Drain `fullStream` and render events inline. We intentionally use
// fullStream (not textStream) so tool calls and results interleave with
// the reasoning text the model emits between steps.
let stepIndex = 0;
let inText = false;

for await (const event of result.fullStream) {
  switch (event.type) {
    case "start-step": {
      stepIndex++;
      process.stdout.write(`\n\x1b[90m[step ${stepIndex}]\x1b[0m `);
      inText = false;
      break;
    }

    case "text-delta": {
      // Text deltas in v6 carry the chunk on `.text` (older builds used `.textDelta`).
      const delta =
        (event as any).text ?? (event as any).textDelta ?? "";
      if (delta) {
        if (!inText) {
          process.stdout.write("\n");
          inText = true;
        }
        process.stdout.write(delta);
      }
      break;
    }

    case "tool-call": {
      const call = event as any;
      const input = call.input ?? call.args ?? {};
      if (inText) {
        process.stdout.write("\n");
        inText = false;
      }
      if (call.toolName === "bash" && input.command) {
        console.log(`  \x1b[36m$ ${input.command}\x1b[0m`);
      } else {
        const preview = JSON.stringify(input).slice(0, 100);
        console.log(`  \x1b[33m${call.toolName}\x1b[0m(${preview})`);
      }
      break;
    }

    case "tool-result": {
      const res = event as any;
      const output = res.output ?? res.result ?? "";
      const text =
        typeof output === "string" ? output : JSON.stringify(output);
      const preview = text.replace(/\n/g, " ").slice(0, 80);
      console.log(
        `  \x1b[90m└─ ${preview}${text.length > 80 ? "…" : ""}\x1b[0m`,
      );
      break;
    }

    case "error": {
      console.error(`\n\x1b[31m[error]\x1b[0m`, (event as any).error);
      break;
    }

    // start, finish-step, finish, and other bookkeeping events are ignored.
  }
}

// 5. `steps` / `text` are promises that resolve once the stream completes.
const steps = await result.steps;
const finalText = await result.text;

console.log("\n" + "─".repeat(60));
console.log(`\nAgent completed in ${steps.length} step(s).\n`);

// Show the final generated report if it was created
try {
  const report = await sandbox.readFile(seed.outputPath);
  console.log(`Generated ${seed.outputPath}:\n`);
  console.log(report);
  console.log("─".repeat(60));
} catch {
  console.log(`(Agent did not create ${seed.outputPath})`);
}

// Show the final text response
if (finalText) {
  console.log("\nFinal agent response:\n");
  console.log(finalText);
}

// Cleanup — wipe only this seed's tenant rows
await sql`DELETE FROM vfs_files WHERE tenant_id = ${seed.tenantId}`;
await sql.end();
