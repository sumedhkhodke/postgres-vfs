/**
 * Seed: Research articles → literature review with contradictions.
 *
 * Four short fake research articles on remote work productivity, each from a
 * different kind of source (academic, business press, corporate research,
 * vendor white paper). They agree on some points and contradict each other
 * on others, so the agent's synthesis pass has real conflicts to surface.
 */
import type { Seed } from "./types.ts";

export const seed: Seed = {
  name: "research",
  description: "Research articles → literature review with contradictions",
  tenantId: "bash-tool-demo-research",
  outputPath: "/reports/literature-review.md",
  systemPrompt:
    "You are a research analyst with access to a virtual filesystem backed by PostgreSQL. Use the bash, readFile, and writeFile tools to explore sources and synthesize across them. Always start by exploring the filesystem structure before reading individual files, and be concrete about what each source actually claims.",
  userPrompt:
    "Read every article under /research. For each one, extract the publisher, main thesis, and key empirical claims. Write /reports/literature-review.md with three sections: (1) 'Source summaries' — a one-paragraph summary of each article with the file it came from; (2) 'Points of agreement' — specific claims that appear in more than one source; (3) 'Contradictions' — places where sources disagree, quoting the opposing claims from each side and citing the source files. Prefer concrete claims over generic statements.",
  files: [
    {
      path: "/research/stanford-2023-callcenter.md",
      content: `# Stanford Remote Work Study (2023)
Authors: N. Bloom, J. Liang, J. Roberts, Z. Ying
Publication: Quarterly Journal of Economics

## Summary
A nine-month randomized experiment at a 16,000-employee Chinese travel agency
found that employees working from home four days per week were 13% more
productive than their office-based peers. 9 percentage points of the gain came
from more minutes worked per shift (fewer breaks, fewer sick days) and 4 points
from more calls handled per minute (a quieter work environment).

## Key claims
- Remote work improved measured productivity by 13%.
- Attrition rates fell by 50% among remote workers.
- Promotion rates were lower for remote workers despite higher measured output.
- The authors argue findings generalize to knowledge-work contexts.

## Methodology
Randomized assignment by even/odd birthdays. Productivity measured via
call-center telemetry (calls completed per shift).
`,
    },
    {
      path: "/research/harvard-2024-hybrid.md",
      content: `# Harvard Business Review — The Case for Hybrid (2024)
Author: T. Neeley
Publication: Harvard Business Review

## Summary
Drawing on interviews with 40 executives across tech, finance, and professional
services, this piece argues that fully-remote teams underperform hybrid teams
on innovation, mentorship, and serendipitous collaboration. In-person time,
the author argues, remains essential for building trust and transmitting tacit
knowledge.

## Key claims
- Hybrid (2–3 days in office) outperforms fully-remote on innovation metrics.
- Junior employees on fully-remote teams receive ~30% less mentorship time.
- Trust formation is roughly 2x faster with any regular in-person contact.
- Fully-remote teams report higher individual output but 20% lower cross-team
  collaboration.

## Methodology
Qualitative interviews with executives and self-reported manager surveys.
`,
    },
    {
      path: "/research/microsoft-2024-worktrend.md",
      content: `# Microsoft Work Trend Index 2024
Publisher: Microsoft

## Summary
Analysis of telemetry from 31,000 workers across 31 countries finds widespread
"productivity paranoia": 85% of managers say the shift to hybrid made them less
confident their employees are being productive, yet 87% of workers report they
are as productive as or more productive than before.

## Key claims
- Manager perception of remote productivity is disconnected from measured output.
- Actual output (document edits, code commits, meetings attended) is flat or
  slightly up versus pre-pandemic baselines.
- Forced return-to-office mandates correlate with higher attrition, especially
  among top performers.
- Async-first teams report fewer meetings and higher self-reported focus time.

## Methodology
Telemetry from Microsoft 365 tenants plus a global worker survey (n=31,000).
`,
    },
    {
      path: "/research/gitlab-2024-remote-report.md",
      content: `# GitLab Remote Report 2024
Publisher: GitLab Inc.

## Summary
GitLab, operating as a fully-remote company of ~2,000 employees, argues that
async-first written communication is the single biggest driver of remote
productivity — more important than geography, time zone, or office access.
Hybrid models, the report claims, preserve office-era defaults (meetings,
synchronous decisions) that undermine the benefits of distribution.

## Key claims
- Fully-remote, async-first teams outperform hybrid teams on output per FTE.
- Written-first communication reduces meeting load by roughly 40%.
- Time-zone diversity is an advantage, not a cost, when workflows are async.
- "Hybrid" often means remote workers are excluded from the important room.

## Methodology
Internal GitLab data plus a survey of 1,700 remote workers across 68 companies.
`,
    },
  ],
};
