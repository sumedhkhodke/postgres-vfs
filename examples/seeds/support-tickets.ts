/**
 * Seed: Customer support tickets → triage report.
 *
 * Eight fake support tickets under /tickets/ covering bugs, billing, feature
 * requests, pre-sales inquiries, and account issues. Two pairs are deliberate
 * duplicates (iOS login failure, slow search) so the agent's dedup pass has
 * something to surface.
 */
import type { Seed } from "./types.ts";

export const seed: Seed = {
  name: "tickets",
  description: "Customer support tickets → triage report with dedup",
  tenantId: "bash-tool-demo-tickets",
  outputPath: "/reports/triage.md",
  systemPrompt:
    "You are a customer support triage assistant with access to a virtual filesystem backed by PostgreSQL. Use the bash, readFile, and writeFile tools to explore files and organize them. Always start by exploring the filesystem structure before reading individual files.",
  userPrompt:
    "Read every ticket under /tickets. For each ticket, determine the topic (bug, billing, feature request, sales/pre-sales, account/access) and urgency (P0=system down, P1=customer blocked, P2=important, P3=nice-to-have). Write /reports/triage.md grouped by topic. Within each group, sort by urgency (P0 first). Explicitly call out any suspected duplicate tickets (same underlying issue reported by different users) in a 'Likely duplicates' section, and suggest a recommended owner team (support, billing, product, sales) for each group.",
  files: [
    {
      path: "/tickets/ticket-1001.txt",
      content: `From: jen.walker@example.com
Date: 2026-04-08 08:14
Subject: URGENT — can't log in on iPhone

Hi, I've been trying to log into the app all morning and it just shows a blank
white screen after I tap Sign In. iPhone 15 Pro, iOS 17.4, app version 4.2.1.
I tried reinstalling, no change. This is blocking me — I need to access my
dashboard for a client meeting at 10am.

Please help!
`,
    },
    {
      path: "/tickets/ticket-1002.txt",
      content: `From: sarah.chen@example.com
Date: 2026-04-07 16:22
Subject: Double charge on my account

Hello, I was charged $99 twice on April 3rd for my Pro subscription. My bank
statement shows both charges going through on the same day. Can you refund one
of them? My account email is this one.

Thanks,
Sarah
`,
    },
    {
      path: "/tickets/ticket-1003.txt",
      content: `From: devon.park@example.com
Date: 2026-04-06 11:03
Subject: Dark mode?

Hey team — loving the product so far. Any chance dark mode is on the roadmap?
The white background is rough on my eyes during late-night work sessions.
Would be a great addition.

Cheers,
Devon
`,
    },
    {
      path: "/tickets/ticket-1004.txt",
      content: `From: ops@brightfield-marketing.com
Date: 2026-04-07 09:41
Subject: Search is unusable

Your search feature has been broken for the past two days. Every query takes
30+ seconds to return results, and half the time it just times out. We're
paying $500/month for this and right now it's costing us billable hours.
What's going on? We need this fixed ASAP or we'll have to look elsewhere.

— Brightfield Marketing Operations
`,
    },
    {
      path: "/tickets/ticket-1005.txt",
      content: `From: it.procurement@initech.com
Date: 2026-04-08 14:55
Subject: SSO support for Okta?

Hi, we're evaluating your platform for a 200-seat rollout across our
engineering and product teams. Our security team requires SAML SSO integrated
with Okta, and we also need audit logs exported to our SIEM (Splunk). Can
someone from sales walk us through whether this is supported on the Enterprise
plan?

Thanks,
Ravi
Initech IT Procurement
`,
    },
    {
      path: "/tickets/ticket-1006.txt",
      content: `From: mark.delgado@example.com
Date: 2026-04-08 10:02
Subject: Login broken on iOS

Hey — your iOS app won't let me log in. I tap Sign In and get a blank screen.
I've got an iPhone 14, iOS 17.3. Happens every time. Please fix.
`,
    },
    {
      path: "/tickets/ticket-1007.txt",
      content: `From: amy.ho@brightfield-marketing.com
Date: 2026-04-07 10:15
Subject: Search extremely slow

Our whole team is complaining that search is taking forever. Multiple times
today I waited over a minute for results. This is really impacting us.
`,
    },
    {
      path: "/tickets/ticket-1008.txt",
      content: `From: tyler.k@example.com
Date: 2026-04-08 06:30
Subject: Password reset email not arriving

I've requested a password reset five times this morning and none of the emails
have shown up in my inbox (checked spam). I'm locked out of my account. Can
someone manually reset it or send a recovery link?
`,
    },
  ],
};
