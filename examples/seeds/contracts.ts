/**
 * Seed: Vendor contracts → risk review.
 *
 * Three fake agreements (SaaS MSA, mutual NDA, consulting SOW) with
 * deliberately varied risk profiles. The Acme MSA has a tight auto-renewal
 * window, the Umbrella NDA is boilerplate and low-risk, and the Globex SOW
 * is missing a liability cap and has unusually long payment terms — so the
 * severity ratings should actually differ across the three.
 */
import type { Seed } from "./types.ts";

export const seed: Seed = {
  name: "contracts",
  description: "Vendor contracts → risk review with severity ratings",
  tenantId: "bash-tool-demo-contracts",
  outputPath: "/reports/contract-risks.md",
  systemPrompt:
    "You are a contract review paralegal with access to a virtual filesystem backed by PostgreSQL. Use the bash, readFile, and writeFile tools to explore and analyze contracts. Always start by exploring the filesystem structure before reading individual files, and cite specific clauses when flagging risks.",
  userPrompt:
    "Read every contract under /contracts. For each contract, extract (a) the term length and auto-renewal behavior, (b) termination windows, (c) payment terms, (d) any limitation of liability, and (e) any other material risks. Write /reports/contract-risks.md with one section per contract that includes a risk severity rating (high / medium / low) with a one-sentence justification grounded in specific clauses. End the report with a 'Top risks to negotiate' section listing the three highest-priority items across all contracts.",
  files: [
    {
      path: "/contracts/acme-saas-msa.md",
      content: `# Master Services Agreement — Acme Analytics, Inc.

Effective date: 2026-01-15
Parties: Acme Analytics, Inc. ("Vendor") and Customer

Term: Initial 12-month term commencing on the Effective Date.

## 1. Services
Vendor shall provide access to its hosted analytics platform and related
support services as described in Exhibit A.

## 2. Fees and Payment
- Annual subscription fee: $50,000, invoiced annually in advance.
- Payment terms: Net 30 days from invoice date.
- Late payments accrue interest at 1.5% per month.

## 3. Term and Renewal
This Agreement shall automatically renew for successive 12-month terms unless
either party provides written notice of non-renewal at least thirty (30) days
prior to the end of the then-current term. Pricing for renewal terms may
increase by up to 7% annually.

## 4. Termination
Either party may terminate for material breach with 30 days' written notice to
cure. Early termination by Customer for convenience is not permitted.

## 5. Limitation of Liability
Vendor's total liability under this Agreement shall not exceed the amounts paid
by Customer to Vendor in the twelve (12) months preceding the claim, up to a
maximum of $100,000.

## 6. Intellectual Property
All customer data remains the property of Customer. All software, algorithms,
and aggregated analytics remain the property of Vendor.

## 7. Data Protection
Vendor shall comply with SOC 2 Type II requirements and maintain encryption in
transit and at rest.
`,
    },
    {
      path: "/contracts/umbrella-nda.md",
      content: `# Mutual Non-Disclosure Agreement — Umbrella Corp

Effective date: 2026-02-10
Parties: Umbrella Corp and Counterparty

## 1. Confidential Information
Each party may disclose to the other certain technical, business, and financial
information that is marked confidential or would reasonably be understood as such.

## 2. Obligations
Each party agrees to:
- Use Confidential Information solely for the Purpose defined in Exhibit A.
- Protect Confidential Information with at least the same standard of care used
  for its own confidential information, but no less than a reasonable standard.
- Not disclose Confidential Information to any third party without prior
  written consent.

## 3. Term
The confidentiality obligations in this Agreement shall remain in effect for
three (3) years from the Effective Date. This Agreement does not automatically
renew.

## 4. Exclusions
Confidential Information does not include information that is:
(a) publicly known through no fault of the receiving party;
(b) already known to the receiving party prior to disclosure;
(c) independently developed without reference to the disclosing party's
    Confidential Information;
(d) rightfully received from a third party without confidentiality duty.

## 5. Return of Materials
Upon written request, each party shall return or destroy all Confidential
Information in its possession within 15 business days.

## 6. No License
This Agreement does not grant any license or intellectual property right.

## 7. Governing Law
This Agreement shall be governed by the laws of the State of Delaware.
`,
    },
    {
      path: "/contracts/globex-consulting-sow.md",
      content: `# Statement of Work — Globex Consulting Services

Effective date: 2026-03-01
Client: Customer
Consultant: Globex Strategy, LLC

## 1. Scope of Work
Consultant shall provide strategy consulting services related to Client's
go-to-market planning, including market analysis, pricing research, and a
final deliverable presentation.

## 2. Timeline
Engagement shall begin on 2026-03-15 and conclude no later than 2026-06-30.

## 3. Fees and Payment
- Fixed project fee: $75,000, invoiced in three installments: 25% upon
  execution, 25% at midpoint, 50% upon delivery.
- Payment terms: Net 60 days from invoice date.
- Out-of-pocket expenses (travel, software) billed separately, no cap.

## 4. Intellectual Property
All work product, deliverables, analysis, and materials created by Consultant
under this SOW shall be assigned to Client upon full payment. Consultant
retains the right to use general methodologies and know-how.

## 5. Termination
Either party may terminate this SOW for convenience with fourteen (14) days'
written notice. Upon termination, Client shall pay for services rendered
through the termination date on a pro-rata basis.

## 6. Limitation of Liability
Not specified. Standard consulting liability applies.

## 7. Confidentiality
Consultant agrees to keep all Client information confidential for a period of
five (5) years from the end of the engagement.
`,
    },
  ],
};
