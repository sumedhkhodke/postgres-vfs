/**
 * Seed: Meeting transcripts → per-person action items report.
 *
 * Four meeting transcripts under /meetings/ with explicit action item sections.
 * Several people (Priya, Jake, Marcus) deliberately appear in more than one
 * meeting so the agent's cross-reference pass has something to find.
 */
import type { Seed } from "./types.ts";

export const seed: Seed = {
  name: "meetings",
  description: "Meeting transcripts → per-person action items report",
  tenantId: "bash-tool-demo-meetings",
  outputPath: "/reports/action-items.md",
  systemPrompt:
    "You are a chief of staff assistant with access to a virtual filesystem backed by PostgreSQL. Use the bash, readFile, and writeFile tools to explore files and synthesize information. Always start by exploring the filesystem structure before reading individual files.",
  userPrompt:
    "Read every meeting transcript under /meetings. Extract every action item with its assignee and deadline, then write /reports/action-items.md grouping items by the person who owns them. For each person, list their items in deadline order (soonest first) and include the source meeting file. At the end of the report, add a 'Cross-meeting watch list' section calling out anyone whose workload spans multiple meetings.",
  files: [
    {
      path: "/meetings/2026-04-02-product-sync.md",
      content: `# Product Weekly Sync — 2026-04-02
Attendees: Priya (PM), Jake (Eng Lead), Marcus (PMM), Ana (CS)

## Notes
- Reviewed Q2 roadmap. Enterprise tier is still the top priority.
- Customer interviews surfaced strong demand for SSO and audit logs.
- Pricing experiment is still unscheduled — Priya will own the design doc.
- Jake flagged that we're missing usage numbers for the enterprise cohort;
  without them we can't size the pricing experiment.
- Marcus walked through the mobile launch comms plan. Needs a press release
  draft before PR review next Tuesday.
- Decision: push the B2B dashboard from Q2 to Q3 so we can focus on SSO.

## Action items
- Priya: finalize pricing experiment design doc by Friday 4/4.
- Jake: pull enterprise-tier usage metrics (MAU, seats, top features)
  and share in #product by EOD Thursday 4/3.
- Marcus: draft mobile launch press release, circulate to PR by 4/8.
- Ana: follow up with the 3 enterprise interviewees to thank them and ask
  if they'll join a second round.
`,
    },
    {
      path: "/meetings/2026-04-03-eng-standup.md",
      content: `# Engineering Standup — 2026-04-03
Attendees: Jake, Sam, Rita, Ben

## Updates
- Jake: auth migration is half-done, blocked on a race condition in the
  session refresh path. Needs a second pair of eyes.
- Sam: finished the on-call rotation setup; runbook is still TODO.
- Rita: p99 latency on /api/search jumped from 180ms to 640ms yesterday
  around 3pm. Cause unknown. Started digging through traces.
- Ben: shipped the avatar upload fix. Closing out the ticket today.

## Action items
- Jake + Sam: pair this afternoon to unblock the auth migration race condition.
- Sam: write on-call handoff runbook by Monday 4/7.
- Rita: investigate /api/search p99 latency spike, post findings in
  #eng-alerts by EOD today.
- Ben: none (cleared).
`,
    },
    {
      path: "/meetings/2026-04-06-design-review.md",
      content: `# Design Review — New Onboarding Flow — 2026-04-06
Attendees: Priya (PM), Ben (Design), Jake (Eng), Lisa (Growth)

## Discussion
- Reviewed the v3 onboarding flow. Current version has 7 steps, feels heavy.
- Lisa shared funnel data: we lose 40% of new signups between steps 3 and 5.
- Agreed to cut the interactive product tour — too much friction up front.
- Tooltips on hover will replace the tour for first-time actions.
- Open question: do we keep the workspace-creation step or auto-create?
  Priya will decide after looking at the retention data.

## Action items
- Priya: ship updated Figma with reduced step count (target: 4 steps)
  by Wednesday 4/8.
- Ben: run a usability test with 5 users on the new flow before 4/15.
- Jake: scope the eng work for the tooltip system, estimate in story points
  before next design review (4/13).
- Lisa: prepare an A/B test plan for the tooltip-vs-tour comparison.
`,
    },
    {
      path: "/meetings/2026-04-07-sales-pipeline.md",
      content: `# Sales Pipeline Review — 2026-04-07
Attendees: Marcus (PMM), Lisa (Growth), Ana (CS), David (Sales)

## Top deals
- Acme Corp — 50-seat renewal, decision expected 4/10. At risk; champion left
  the company last month. Marcus is the account lead.
- Globex — expansion from 20 to 100 seats. They're asking for a discount.
  Lisa to draft a proposal.
- Initech — existing customer, quarterly business review overdue by 3 weeks.
  Ana owns the relationship.
- Umbrella — new logo, in late-stage eval. David is running the POC.

## Action items
- Marcus: follow up with Acme Corp on the 50-seat renewal before 4/10.
  Loop in the new champion.
- Lisa: draft Globex discount proposal (target: 15% off with annual commit),
  share with David by 4/9.
- Ana: schedule the Initech QBR by Friday 4/10, find a slot before month end.
- David: send Umbrella the security questionnaire today.
`,
    },
  ],
};
