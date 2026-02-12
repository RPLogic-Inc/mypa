# Tez for Consulting

**Tezit Protocol v1.2 -- Industry Guide**
**Audience**: Partners, Engagement Managers, Consultants, Knowledge Management, Client Teams
**Last Updated**: February 2026

---

## Table of Contents

1. [The Problem in Consulting](#the-problem-in-consulting)
2. [How Tez Solves It](#how-tez-solves-it)
3. [Example: Strategy Engagement Tez](#example-strategy-engagement-tez)
4. [Example: Organizational Assessment Tez](#example-organizational-assessment-tez)
5. [Example: Technology Advisory Tez](#example-technology-advisory-tez)
6. [Getting Started](#getting-started)
7. [Competitive Advantage](#competitive-advantage)

---

## The Problem in Consulting

Consulting exists to transfer expertise. A client hires a firm because the firm has seen the pattern before, has the frameworks, has the data, has the judgment to synthesize it all into a recommendation. And yet the standard consulting deliverable -- the polished slide deck, the beautifully formatted PDF -- is deliberately designed to hide all of that machinery.

This isn't a small irony. It's the central failure of how consulting firms deliver value.

### Deliverables are polished PDFs with no supporting evidence visible

A strategy firm delivers a 60-slide deck recommending market entry into Southeast Asia. The slides reference "our analysis of 14 comparable market entries," cite "customer interview findings," and include charts labeled "proprietary benchmarking data." But the actual analyses, the interview transcripts, the raw benchmarking -- none of this is transmitted. The client receives the conclusion. The scaffolding stays on the consultant's laptop.

The deck is impressive. It's also unverifiable.

### Client teams can't interrogate methodology

After the final presentation, the client's VP of Strategy has a pointed question: "Your slide says the market in Vietnam is growing at 23% CAGR. Is that the whole market or just the enterprise segment? And which source?" In a traditional engagement, this question triggers an email to the engagement manager, who checks with the associate, who digs through a folder, finds the source, and responds 48 hours later.

The analysis was rigorous. But the deliverable format makes every follow-up question a research project.

### Frameworks lose context when applied to new engagements

A firm developed an excellent market sizing framework during a 2024 engagement with a healthcare company. When a similar question arises for a manufacturing client in 2026, a manager remembers the framework exists and asks the knowledge management team to find it. What comes back is a sanitized template -- the methodology without the context that made it work. The nuances of how the framework was adapted for that specific client, which assumptions drove the results, which data sources proved most reliable -- all stripped away in the name of confidentiality.

The framework is reused. The judgment behind it is not.

### Junior consultants re-create analyses from scratch

A new associate is staffed on a due diligence engagement. The firm has done 200 commercial due diligences in the past five years. But the associate's starting point is a blank deck template and a methodology document that reads like a textbook. The actual reasoning from prior engagements -- how experienced consultants decided which customer segments to prioritize, which risks proved material, which analytical shortcuts work and which don't -- exists only in the minds of partners and managers who are too busy to mentor at that level of detail.

Every junior consultant reinvents the wheel because the wheels are locked in filing cabinets.

### Knowledge management systems are where insights go to die

Every major firm has invested millions in knowledge management platforms. The pitch is always the same: "Capture what you learn on engagements so others can benefit." The reality is equally consistent: consultants upload sanitized deliverables at project close-out, tag them with a few keywords, and never look at them again. When someone searches the KM system, they find polished outputs that can't answer the questions they actually have. "What discount rate did we use for the India market entry analysis?" is not answerable by reading the final deck.

The KM system has the artifact but not the intelligence.

---

## How Tez Solves It

A Tez bundles the synthesis (your recommendation, assessment, or roadmap) with the full context (research, data, interviews, models) and the reasoning trail. The result is a consulting deliverable that clients can interrogate, that firms can reuse with full context, and that transforms how knowledge compounds across engagements.

### Engagement Deliverables as Tezits

Instead of delivering a slide deck that references hidden analysis, you tezit the complete engagement output:

```
southeast-asia-market-entry/
  manifest.json
  tez.md                              # The recommendation document
  context/
    market-research/
      vietnam-market-sizing.xlsx
      indonesia-competitive-landscape.pdf
      thailand-regulatory-overview.pdf
      southeast-asia-macro-forecast.pdf
    customer-interviews/
      interview-vp-operations-acme-manufacturing.md
      interview-cto-globaltech.md
      interview-regional-director-apex-logistics.md
      interview-summary-matrix.xlsx
    competitor-analysis/
      competitor-profiles.xlsx
      competitor-pricing-analysis.pdf
      market-share-estimates.xlsx
    financial-projections/
      market-entry-financial-model.xlsx
      scenario-analysis.xlsx
      investment-requirement-breakdown.xlsx
    benchmarking/
      comparable-market-entries-database.xlsx
      success-failure-case-studies.pdf
  conversation.json
  params.json
```

The client receives not just your recommendation but the entire analytical apparatus. They can verify any claim, explore any assumption, and ask any follow-up question without waiting for a response from the engagement team.

### Client Empowerment

This is the transformative shift. When a client CEO receives a strategy Tez, the conversation changes:

> **CEO**: "Why did you recommend Strategy B over Strategy A?"

Instead of scheduling a call with the partner, the CEO interrogates the Tez:

**AI Response** (grounded in engagement context): "The recommendation for Strategy B (Vietnam-first entry with Indonesia follow-on) over Strategy A (simultaneous entry) is based on three factors documented in the analysis: (1) The financial model [[context/financial-projections/market-entry-financial-model.xlsx:scenario_comparison]] shows Strategy B requires $14M in initial capital versus $31M for Strategy A, with Strategy B reaching breakeven 8 months earlier due to sequential learning effects. (2) Customer interviews [[context/customer-interviews/interview-summary-matrix.xlsx]] indicate that 5 of 7 prospective customers in Vietnam expressed willingness to provide reference cases that would accelerate Indonesia entry, whereas simultaneous entry forfeits this reference-building advantage. (3) The comparable market entries database [[context/benchmarking/comparable-market-entries-database.xlsx]] shows that 9 of 14 comparable entries that used a sequential approach achieved target market share within 3 years, versus 4 of 14 for simultaneous entry."

The CEO didn't get a summary. They got a grounded answer with citations they can click through and verify. And the engagement team didn't have to do anything -- the Tez answered for itself.

### Knowledge Libraries

Over time, a firm builds a vault of engagement tezits. Unlike a traditional KM system where sanitized decks collect dust, a tez vault is a living, interrogable knowledge base:

> **Manager** (preparing a new engagement): "What discount rates has this firm used for consumer technology market entries in emerging Asia?"

**AI Response** (searching across firm tez vault): "Across 6 relevant engagement tezits in the vault: The Vietnam e-commerce entry analysis (2025) used 14.5% WACC [[vault/vietnam-ecommerce/context/financial-model.xlsx:assumptions]]. The Indonesia SaaS market entry (2024) used 16.2% [[vault/indonesia-saas/context/dcf-model.xlsx:wacc_calculation]], noting the higher rate reflected regulatory uncertainty. The Thailand fintech assessment (2025) used 13.8% [[vault/thailand-fintech/context/scenario-model.xlsx:base_case]]. The range across all engagements is 13.8% to 18.1%, with a median of 15.2%. Note: the highest rate (18.1%) was used in the Myanmar analysis which included a specific country risk premium of 400bp that may not apply to more stable markets."

This is semantic knowledge retrieval. Not keyword search on sanitized decks, but interrogation of the actual analytical work the firm has done.

### Forking for Alternatives

When a client pushes back on a recommendation, the engagement team doesn't start over. They fork:

```json
{
  "lineage": {
    "forked_from": "southeast-asia-market-entry-v2",
    "fork_type": "alternative_recommendation",
    "fork_label": "Indonesia-First Scenario (per client request)",
    "parameter_overrides": {
      "entry_sequence": "indonesia_first",
      "initial_investment": "$22M",
      "timeline_to_breakeven": "28 months"
    },
    "additions": [
      "indonesia-regulatory-deep-dive.pdf",
      "indonesia-partner-shortlist.xlsx",
      "revised-financial-model-indonesia-first.xlsx"
    ]
  }
}
```

The fork inherits all the original research and analysis but adjusts the recommendation based on new parameters. Both the original and the fork are interrogable, so the client can directly compare: "What's the risk profile difference between the Vietnam-first and Indonesia-first approaches?"

---

## Example: Strategy Engagement Tez

### The Scenario

NorthStar Consumer Brands, a $400M specialty food company, has retained your firm to evaluate market entry options in Asia. After 8 weeks of research and analysis, the team is ready to deliver the final recommendation.

### The Synthesis

```markdown
# NorthStar Consumer Brands -- Asia Market Entry Strategy

## Executive Recommendation

We recommend a phased market entry into South Korea as the primary
market, followed by Japan within 18 months.

**Rationale**: South Korea offers the optimal combination of market
size, regulatory accessibility, cultural fit for NorthStar's product
portfolio, and strategic positioning for subsequent Japan entry.

## Market Assessment

### South Korea
- **Market size**: $3.2B specialty food market, growing at 8.4% CAGR
  [[context/market-research/korea-specialty-food-market.xlsx:summary]]
- **Consumer fit**: Korean consumers' willingness to pay a premium for
  imported specialty foods ranks highest among Asian markets at 72%
  [[context/market-research/consumer-survey-results.xlsx:korea_tab]]
- **Regulatory pathway**: MFDS (Ministry of Food and Drug Safety)
  registration process averages 4-6 months for NorthStar's product
  categories [[context/market-research/korea-regulatory-timeline.pdf]]
- **Distribution**: Identified 3 Tier 1 distributors with existing
  specialty food portfolios and combined reach of 85% of premium
  retail [[context/market-research/korea-distributor-profiles.xlsx]]

### Japan (Phase 2)
- **Market size**: $8.7B specialty food market (largest in Asia)
  [[context/market-research/japan-market-sizing.xlsx]]
- **Entry complexity**: MHLW registration requires 9-14 months and
  local testing [[context/market-research/japan-regulatory-analysis.pdf]]
- **Strategic rationale**: Korean market success provides proof points
  and case studies that dramatically improve negotiating position with
  Japanese distributors. Of 11 comparable food brand entries
  [[context/benchmarking/food-brand-asia-entries.xlsx]], 8 that entered
  Japan with existing Asian presence achieved Tier 1 distribution
  partnerships vs. 2 of 9 that entered Japan directly.

### Markets Evaluated but Not Recommended
- **China**: Regulatory complexity and IP protection concerns
  [[context/market-research/china-risk-assessment.pdf]]. Recommended
  for Phase 3 consideration only.
- **Vietnam/Indonesia**: Market size insufficient for NorthStar's
  premium positioning. Average willingness-to-pay for imported
  specialty foods: 31% and 28% respectively
  [[context/market-research/consumer-survey-results.xlsx:comparison_tab]]

## Customer Interview Findings

We conducted 23 interviews across prospective retailers, distributors,
and end consumers in Korea and Japan
[[context/customer-interviews/interview-summary-matrix.xlsx]]:

- **Retailers (7 interviews)**: 6 of 7 Korean retailers expressed
  interest in stocking NorthStar products, contingent on marketing
  support commitment. Key quote from Shinsegae buyer: "American
  specialty foods are having a moment. Your timing is excellent if you
  can commit to co-marketing" [[context/customer-interviews/retailer-shinsegae.md:q7]]
- **Distributors (5 interviews)**: All 3 Korean Tier 1 distributors
  indicated willingness to take meetings. Two requested exclusivity
  for the first 24 months [[context/customer-interviews/distributor-summary.md]]
- **Consumers (11 interviews)**: NorthStar's brand positioning around
  "authentic craft" resonated strongly with Korean millennials (ages 28-42).
  8 of 11 expressed purchase intent at the proposed price point
  [[context/customer-interviews/consumer-focus-group-korea.md]]

## Financial Projections

Five-year P&L for Korea entry [[context/financial-projections/korea-entry-model.xlsx]]:

| Year | Revenue | EBITDA | Cumulative Investment |
|------|---------|--------|-----------------------|
| Y1 | $4.2M | ($2.1M) | $6.8M |
| Y2 | $11.8M | $0.4M | $8.5M |
| Y3 | $19.4M | $3.2M | $8.5M |
| Y4 | $26.1M | $5.8M | $8.5M |
| Y5 | $31.7M | $8.4M | $8.5M |

Breakeven in month 22. IRR: 34%.
Downside scenario (50% of base revenue): IRR 11%, breakeven month 38.

## Implementation Roadmap

Phase 1 (Months 1-6): Regulatory submission, distributor selection,
local team hiring [[context/implementation/phase1-workplan.xlsx]]

Phase 2 (Months 7-12): Product launch in top 3 Korean retail chains,
initial marketing campaign, begin Japan MHLW registration

Phase 3 (Months 13-24): Korea expansion to Tier 2 retail, Japan
soft launch through Korean distributor's Japan affiliate
```

### Client Interrogation

> **CEO**: "What if we enter Japan instead of Korea? Our board has a relationship with a Japanese distributor."

**AI Response**: "Entering Japan directly was evaluated in the market assessment. The analysis shows three key disadvantages compared to Korea-first: (1) Regulatory timeline: MHLW registration requires 9-14 months versus 4-6 months for Korean MFDS [[context/market-research/japan-regulatory-analysis.pdf:p3]], delaying revenue by approximately 6 months. (2) Distribution leverage: The benchmarking data [[context/benchmarking/food-brand-asia-entries.xlsx]] shows that brands entering Japan without existing Asian presence secured Tier 1 distribution at a 22% rate versus 89% for those with Asian market proof points. A pre-existing board relationship may mitigate this, though the data suggests that distributor interest alone does not predict retail placement success. (3) Financial impact: The Japan-direct financial model [[context/financial-projections/japan-direct-scenario.xlsx]] shows breakeven at month 31 versus month 22 for Korea-first, with IRR of 21% versus 34%. However, if the board relationship can secure guaranteed placement in a major retail chain, the Japan-direct IRR improves to approximately 28% [[context/financial-projections/japan-direct-scenario.xlsx:sensitivity_tab]]. I recommend requesting a specific commitment from the Japanese distributor to quantify this advantage."

> **CFO**: "The $6.8M initial investment -- what's the breakdown and what could we cut?"

**AI Response**: "The $6.8M initial investment breaks down as follows [[context/financial-projections/korea-entry-model.xlsx:investment_breakdown]]: Regulatory and legal ($0.8M), inventory and logistics ($1.9M), local team salaries for 18 months ($1.4M), marketing and co-promotion commitments ($1.8M), and contingency ($0.9M). The most compressible line is marketing at $1.8M. However, 6 of 7 retailers conditioned their stocking interest on marketing support commitment [[context/customer-interviews/interview-summary-matrix.xlsx:retailer_conditions]]. Reducing marketing below $1.2M risks losing the Shinsegae and Lotte Mart commitments. The contingency ($0.9M) could be reduced to $0.5M if the board has appetite for higher risk. Combined, this brings the minimum viable investment to approximately $5.5M."

### Internal Fork: Alternative Recommendation

The engagement team creates an alternative for the board presentation:

```markdown
# NorthStar Asia Entry -- Japan-First Alternative
**Forked from**: northstar-asia-entry-v3

## Modified Recommendation

Japan-first entry leveraging board relationship with Mitsubishi Foods.

## Key Differences from Base Case

| Factor | Korea-First (Base) | Japan-First (Alternative) |
|--------|-------------------|---------------------------|
| Initial Investment | $6.8M | $9.2M |
| Time to Revenue | 6 months | 12 months |
| Breakeven | Month 22 | Month 31 |
| 5-Year Revenue | $93.2M | $118.4M |
| IRR | 34% | 21-28% |

## Why This Might Be Right

If Mitsubishi Foods commits to guaranteed placement in Aeon and
Lawson chains, the Japan-first approach captures a larger market
faster despite higher upfront cost. The 5-year cumulative revenue
is 27% higher [[context/financial-projections/japan-first-revised-model.xlsx]].

## What We'd Need to Validate

1. Written commitment from Mitsubishi Foods on distribution scope
2. Confirmation of Aeon/Lawson placement terms
3. MHLW pre-submission meeting to confirm 9-month timeline
```

Both the base case and the alternative are fully interrogable. The board can compare them side by side, asking different questions of each.

---

## Example: Organizational Assessment Tez

### The Scenario

Your firm has been engaged by Pinnacle Insurance Group ($12B premiums) to assess their organizational structure and recommend a restructuring to support a new digital-first strategy. The engagement included 45 interviews, a culture survey of 2,800 employees, and benchmarking against 8 peer companies.

### The Synthesis

```markdown
# Pinnacle Insurance Group -- Organizational Assessment

## Executive Summary

Pinnacle's current organizational structure -- organized around
product lines (Life, Property & Casualty, Commercial) -- creates
three critical barriers to digital transformation:

1. **Duplicated technology investment**: Each division maintains
   independent technology teams, resulting in $47M in redundant
   spending annually [[context/benchmarking/tech-spend-analysis.xlsx]]

2. **Customer fragmentation**: A customer who holds both Life and P&C
   policies interacts with Pinnacle as two separate companies. Only 12%
   of multi-product customers report a "unified experience"
   [[context/culture-survey/customer-experience-results.xlsx:multi_product_tab]]

3. **Talent bottleneck**: Digital and data science talent is spread
   across divisions with no career path or community of practice.
   Attrition in these roles is 31% versus 14% company-wide
   [[context/hr-data/attrition-analysis.xlsx:digital_roles]]

## Recommendation: Customer-Centric Matrix

We recommend transitioning to a customer-centric matrix structure:

- **Customer Segments** (primary axis): Individual, Small Business,
  Mid-Market, Enterprise
- **Capabilities** (horizontal): Underwriting, Claims, Distribution,
  Technology, Data & Analytics

This structure is used by 5 of 8 benchmark peers
[[context/benchmarking/org-structure-comparison.xlsx]] and is
associated with 23% higher NPS scores and 15% lower operating
expense ratios.

## Interview Findings

### What Leadership Says

- "We talk about being customer-centric but our P&L is product-centric.
  You get what you measure." -- EVP Commercial Lines
  [[context/interviews/evp-commercial.md:q4]]

- "I've been trying to hire a head of data science for 18 months.
  Every good candidate asks about career path and community. We can't
  answer." -- CTO [[context/interviews/cto.md:q7]]

- "The irony is we have three separate Salesforce instances. Three.
  For the same company." -- COO [[context/interviews/coo.md:q2]]

### What Employees Say

Culture survey results [[context/culture-survey/full-results.xlsx]]:
- 67% agree "I understand Pinnacle's digital strategy" (below 80%
  benchmark)
- 43% agree "My division collaborates effectively with other divisions"
  (below 65% benchmark)
- 78% agree "I would recommend Pinnacle as an employer" (above 72%
  benchmark -- people like working here, they just find the structure
  frustrating)

## Implementation Risk

The largest risk is mid-level management resistance. Interview data
shows that 8 of 12 VP-level leaders expressed concerns about losing
P&L ownership in a matrix structure
[[context/interviews/interview-summary-matrix.xlsx:vp_concerns]].

Mitigation: Phase the transition over 18 months, starting with
Technology and Data & Analytics consolidation (lower political
resistance) before restructuring customer-facing functions.
```

### CHRO Interrogation

> **CHRO**: "You cite 31% attrition for digital roles. Is that consistent across divisions or concentrated somewhere?"

**AI Response**: "The attrition data [[context/hr-data/attrition-analysis.xlsx:digital_roles_by_division]] shows significant variation by division. Commercial Lines digital attrition is 41%, Life is 28%, and P&C is 24%. The Commercial Lines rate is driven primarily by the data engineering team, where 6 of 11 engineers left in the past 12 months. Exit interview themes for Commercial Lines digital roles [[context/hr-data/exit-interview-themes.xlsx:commercial_digital]] center on 'limited scope of projects' (cited by 4 of 6) and 'no clear advancement path within the division' (cited by 5 of 6). This supports the recommendation that consolidating digital roles into a horizontal capability function would improve retention by creating a larger peer community and clearer career trajectory."

> **CHRO**: "How did the benchmark companies handle the transition? Any failures we should know about?"

**AI Response**: "Of the 5 benchmark peers that adopted a customer-centric matrix, 4 consider the transition successful based on our interviews with their leadership. The exception is National General, which attempted the transition in 2022 and partially reverted in 2024. The case study [[context/benchmarking/national-general-case-study.pdf]] identifies two failure factors: (1) they attempted the entire restructuring in 6 months rather than phasing, and (2) they eliminated product-line P&L accountability entirely rather than creating dual reporting. The other 4 successful transitions all maintained some form of product economics visibility alongside the customer segment structure. Our recommendation incorporates both of these lessons -- the 18-month phased approach and the matrix structure that preserves capability P&L alongside segment P&L."

---

## Example: Technology Advisory Tez

### The Scenario

Your firm has been retained by Continental Manufacturing ($2.8B revenue) to develop a cloud migration roadmap. The engagement assessed 340 applications, interviewed 28 technical leaders, evaluated 4 cloud providers, and modeled a 5-year TCO.

### The Synthesis

```markdown
# Continental Manufacturing -- Cloud Migration Roadmap

## Executive Recommendation

Migrate to a multi-cloud architecture with AWS as primary (70% of
workloads) and Azure as secondary (30%), executed over 36 months
in four waves.

**Total 5-year investment**: $34.2M
**Total 5-year savings**: $51.8M (net benefit: $17.6M)
**Payback period**: 27 months

## Application Assessment

Of 340 applications assessed [[context/app-inventory/full-assessment.xlsx]]:

| Migration Strategy | Count | % |
|-------------------|-------|---|
| Rehost (lift-and-shift) | 142 | 42% |
| Replatform | 87 | 26% |
| Refactor | 43 | 13% |
| Retire | 38 | 11% |
| Retain (on-premises) | 30 | 9% |

The 30 applications recommended for retention on-premises include
the Siemens SCADA systems controlling manufacturing floor operations
and the legacy ERP modules with hard dependencies on IBM AS/400
hardware [[context/app-inventory/retain-rationale.xlsx]].

## Cloud Provider Evaluation

Vendor assessment [[context/vendor-evaluation/scoring-matrix.xlsx]]:

| Criteria (Weight) | AWS | Azure | GCP | Oracle Cloud |
|-------------------|-----|-------|-----|-------------|
| Manufacturing IoT (25%) | 4.2 | 3.8 | 3.5 | 2.9 |
| Enterprise Integration (20%) | 4.0 | 4.3 | 3.2 | 3.8 |
| Cost Model (20%) | 3.9 | 3.7 | 4.1 | 3.4 |
| Security/Compliance (15%) | 4.1 | 4.0 | 3.9 | 3.7 |
| Talent Availability (10%) | 4.4 | 4.2 | 3.6 | 2.8 |
| Exit Flexibility (10%) | 3.5 | 3.3 | 3.8 | 2.5 |
| **Weighted Score** | **4.02** | **3.89** | **3.56** | **3.26** |

AWS scores highest overall due to manufacturing IoT capabilities
(AWS IoT SiteWise, Greengrass) and talent availability. Azure is
recommended as secondary provider to leverage existing Microsoft
365 and Dynamics integration and avoid vendor lock-in.

## Migration Waves

### Wave 1 (Months 1-9): Foundation + Quick Wins
- Landing zone setup (networking, security, IAM)
- 47 applications: dev/test environments, internal tools, file shares
- Risk level: Low
- Cost: $4.8M
- [[context/migration-waves/wave1-detailed-plan.xlsx]]

### Wave 2 (Months 10-18): Business Applications
- 89 applications: CRM, HR, finance (non-ERP)
- Azure AD integration for SSO
- Risk level: Medium
- Cost: $8.2M
- [[context/migration-waves/wave2-detailed-plan.xlsx]]

### Wave 3 (Months 19-27): Core Systems
- 63 applications: ERP satellite systems, supply chain
- Data warehouse migration to Snowflake on AWS
- Risk level: High (production systems)
- Cost: $12.1M
- [[context/migration-waves/wave3-detailed-plan.xlsx]]

### Wave 4 (Months 28-36): Manufacturing + IoT
- 34 applications: MES integration, IoT data pipelines
- Edge computing deployment at 12 manufacturing sites
- Hybrid connectivity to retained on-premises SCADA
- Risk level: High
- Cost: $9.1M
- [[context/migration-waves/wave4-detailed-plan.xlsx]]

## Risk Matrix

Top 5 risks with mitigation [[context/risk-assessment/risk-register.xlsx]]:

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Production system outage during Wave 3 | Critical | Medium | Blue-green deployment with 30-day parallel run |
| Cost overrun on refactoring | High | High | Fixed-price contracts for top 15 refactor apps |
| Talent shortage for AWS IoT | High | Medium | Training program + contractor bridge (see plan) |
| Network latency to manufacturing sites | Critical | Low | Direct Connect to 3 primary sites; SD-WAN to others |
| Vendor lock-in exceeds acceptable level | Medium | Medium | Kubernetes abstraction layer for Wave 2+ workloads |
```

### CTO Interrogation

> **CTO**: "Why AWS over GCP for manufacturing IoT? Our team has some GCP experience."

**AI Response**: "The vendor scoring matrix [[context/vendor-evaluation/scoring-matrix.xlsx:iot_detail]] evaluated manufacturing IoT across 8 sub-criteria. AWS scored higher than GCP in three areas critical to Continental's use case: (1) OPC-UA protocol support -- AWS IoT SiteWise has native OPC-UA integration with Siemens S7 PLCs, which Continental uses at 9 of 12 sites [[context/app-inventory/scada-systems-detail.xlsx]]. GCP IoT Core requires a third-party gateway for OPC-UA. (2) Edge computing maturity -- AWS Greengrass supports ML inference at the edge, which the proposed predictive maintenance use case requires [[context/use-cases/predictive-maintenance-architecture.pdf]]. GCP's Distributed Cloud Edge is newer and was not yet GA for manufacturing use cases at time of evaluation. (3) Manufacturing-specific reference architectures -- AWS provided 3 relevant customer references in discrete manufacturing [[context/vendor-evaluation/aws-reference-calls.md]], while GCP provided 1. That said, GCP scored higher on cost model (4.1 vs 3.9) and exit flexibility (3.8 vs 3.5). If Continental's team has GCP expertise and IoT is a lower priority than cost optimization, a GCP-primary / AWS-secondary split could be viable. This would require re-scoring with adjusted weights."

> **CTO**: "What happens if Wave 3 goes wrong? What's the rollback plan?"

**AI Response**: "The Wave 3 risk mitigation plan [[context/migration-waves/wave3-detailed-plan.xlsx:rollback_tab]] specifies a blue-green deployment approach for all production systems. Specifically: (1) Each application runs in parallel on-premises and in cloud for a minimum of 30 days before cutover. (2) DNS-based traffic routing allows instant rollback -- switching back to on-premises takes less than 5 minutes with no data loss. (3) Data synchronization runs bidirectionally during the parallel period using AWS DMS for database workloads. The detailed rollback procedures for the top 10 critical applications are in [[context/migration-waves/wave3-rollback-procedures.pdf]]. The total cost of the 30-day parallel run is approximately $890K in duplicate infrastructure, which is included in the $12.1M Wave 3 budget. The go/no-go criteria for cutover are defined in [[context/migration-waves/wave3-cutover-criteria.xlsx]] and include latency thresholds, error rates, and user acceptance sign-off from each business unit."

---

## Getting Started

### Creating Your First Consulting Tez

1. **Start at project close-out.** Take a completed engagement and bundle the deliverable with its supporting materials:
   - The final presentation or report
   - Research reports and data sources
   - Financial models and analyses
   - Interview transcripts or summaries
   - Benchmarking data
   - Working documents and analyses that informed the recommendation

2. **Create the bundle**:
   ```
   engagement-tez/
     manifest.json
     tez.md                     # The recommendation document
     context/
       research/                # Third-party reports, market data
       interviews/              # Transcripts, summaries
       models/                  # Financial models, sizing models
       benchmarking/            # Peer comparisons, databases
       data/                    # Survey results, raw data
       working-docs/            # Internal analyses, scratch work
   ```

3. **Add a manifest**:
   ```json
   {
     "tezit_version": "1.2",
     "id": "northstar-asia-entry-2026-02",
     "title": "NorthStar Consumer Brands -- Asia Market Entry Strategy",
     "created_at": "2026-02-05T10:00:00Z",
     "creator": {
       "name": "Maria Gonzalez",
       "org": "Strategic Insights Group"
     },
     "synthesis": {
       "file": "tez.md",
       "type": "strategy_recommendation"
     },
     "profile": "knowledge"
   }
   ```

4. **Share the Tez with your client.** Upload to Tezit.com and send the link, or share the folder directly. The client sees a formatted document with an interrogation interface -- no technical skill required.

### Best Practices for Interview Transcripts as Context

Interview data is often the most valuable and most sensitive context in a consulting engagement. Handle it well:

- **Include full transcripts, not just summaries.** The AI can extract nuance from a full transcript that a summary misses. When the CEO asks "What exactly did our VP of Sales say about channel conflict?" the Tez can cite the specific quote.

- **Use consistent formatting**:
  ```markdown
  # Interview: Sarah Chen, VP Operations, Acme Manufacturing
  **Date**: January 15, 2026
  **Interviewer**: James Park
  **Duration**: 45 minutes

  ## Q1: How would you describe the current organizational challenges?

  > "The biggest issue is that we have three technology teams doing the
  > same thing. I need a simple dashboard for my manufacturing KPIs and
  > I have to go through a different IT group depending on which plant
  > I'm asking about. It's absurd."

  ## Q2: What would an ideal structure look like?

  > "I don't care about the org chart. I care about getting one phone
  > number to call when something breaks. Right now I have a Rolodex
  > of 15 IT contacts across three divisions."
  ```

- **Create a summary matrix** that maps themes across interviews:
  ```
  interview-summary-matrix.xlsx
    Columns: Interviewee, Role, Theme 1 (Tech Duplication), Theme 2 (Customer Fragmentation), ...
    Rows: Each interviewee with supporting quotes and page references
  ```

- **Anonymize when necessary.** If specific interviewees could face retaliation, use role-based identifiers ("VP Operations, Division A") and note the anonymization in the manifest.

### Handling Confidential Client Data

- **Engagement-level permissions**: Each Tez should specify who can access it:
  ```json
  {
    "permissions": {
      "interrogate": ["client-steering-committee", "engagement-team"],
      "fork": ["engagement-team"],
      "reshare": false,
      "confidentiality": "client_confidential",
      "data_classification": "restricted"
    }
  }
  ```

- **Sanitized versions**: Create sanitized forks for the firm's knowledge library. The fork removes client names, specific financial data, and identifying details while preserving the analytical methodology and frameworks:
  ```json
  {
    "lineage": {
      "forked_from": "northstar-asia-entry-v3",
      "fork_type": "sanitized_for_km",
      "redactions": [
        "Client name replaced with [Consumer Brand A]",
        "Revenue figures rounded to nearest $100M",
        "Interview names replaced with role identifiers"
      ]
    }
  }
  ```

- **Engagement team collaboration**: During an active engagement, the Tez serves as the team's shared analytical workspace. All team members interrogate the same context, ensuring consistency.

### Engagement Team Collaboration

The Tez format transforms how teams work together on engagements:

- **Shared context, not shared files.** Instead of a messy shared drive with conflicting file versions, the engagement Tez is a single source of truth. Everyone interrogates the same context.
- **Structured contributions.** Each team member adds context items with proper metadata. When the associate adds the benchmarking analysis, it's immediately available for the manager's synthesis.
- **Version history.** The Tez tracks how the recommendation evolved -- from initial hypothesis through research findings to final position. This is invaluable for quality review and for training junior staff.

---

## Competitive Advantage

### Why Tezits Differentiate Your Firm

In a market where every firm has smart people and established frameworks, differentiation comes down to how you deliver value. Tezits change the game:

**Before**: "Here's our 60-slide recommendation. Call us if you have questions."

**After**: "Here's our recommendation bundled with every piece of research, every interview, every model that informed it. Ask it anything. If you disagree, fork it and show us why."

The second approach communicates confidence, transparency, and client respect. It says: "We're not hiding behind polished slides. Our work stands up to scrutiny."

### Client Retention Through Interrogable Deliverables

Traditional consulting engagements end. The team rolls off, the client gets the deck, and follow-up questions require new SOWs. Tezits extend the value window:

- **Self-service follow-up**: Clients answer their own follow-up questions by interrogating the engagement Tez. This reduces unnecessary calls and emails while maintaining the client relationship.
- **Ongoing relevance**: When market conditions change, the client can re-interrogate the Tez: "Given that Korea's specialty food tariffs increased by 5% in Q3, does the entry recommendation still hold?" The AI answers from the original analysis, flagging which conclusions are affected.
- **Expansion opportunities**: When a client has an engaged, interrogable knowledge base from your firm, the barrier to the next engagement is lower. "We loved the Asia entry Tez. Can you do the same analysis for Latin America?"

### Building Reusable IP Across Engagements

The firm's tez vault becomes its most valuable asset:

- **Framework evolution**: A market sizing framework used across 20 engagements has been refined and validated 20 times. Each version is traceable, and the interrogation model reveals which refinements improved accuracy.
- **Benchmarking depth**: Every engagement adds to the firm's benchmarking database. After 50 organizational assessments, the firm's vault contains interview data, culture survey results, and restructuring outcomes from 50 companies -- interrogable as a single knowledge base.
- **Proposal acceleration**: When preparing a proposal for a new client, the team can interrogate the vault: "What did we find when assessing organizational readiness for digital transformation in insurance companies with $5-15B in premiums?" The answer draws from multiple prior engagements (sanitized), dramatically accelerating the proposal.

### Training Junior Consultants with Interrogable Work Product

This may be the most underestimated advantage. Traditional consulting training relies on:
- Classroom instruction on frameworks
- Mentorship from busy senior consultants
- Trial and error on live engagements

With a tez vault, junior consultants can:

- **Learn from real engagements**: "Show me how the team approached market sizing in the NorthStar engagement." The AI walks through the actual methodology, data sources, and reasoning.
- **Understand judgment calls**: "Why did the team recommend Vietnam-first instead of simultaneous entry?" The answer isn't from a textbook -- it's from the actual analysis, with citations to the specific data that drove the decision.
- **Practice interrogation**: Junior consultants can interrogate senior consultants' tezits as practice for client interactions. "What would you say if the client asked about the impact of currency fluctuation on the financial model?" The AI answers as the Tez would, with full grounding.
- **Build on existing work**: When a junior consultant is staffed on a similar engagement, they don't start from scratch. They fork a relevant prior Tez, adapt the framework to the new context, and add their own research. The senior consultant can see exactly what was inherited and what was added.

---

## Why This Matters

Consulting firms sell two things: expertise and communication. The expertise is in the people. The communication has been trapped in slide decks for decades.

A Tez doesn't replace the consultant. It amplifies the consultant by making their work product live beyond the final presentation. The analysis is interrogable. The methodology is verifiable. The frameworks are reusable. The knowledge compounds.

For clients, this means paying for consulting engagements that deliver lasting value, not ephemeral decks. For firms, this means building an asset that grows more valuable with every engagement. For individual consultants, this means their best work doesn't disappear when the project ends -- it becomes part of an interrogable legacy that trains the next generation.

That's what "GitHub for knowledge work" means for consulting: version-controlled, forkable, interrogable expertise that compounds across engagements instead of decaying in a knowledge management system.

---

*This guide is part of the Tezit Protocol v1.2 industry series. For the full protocol specification, visit [tezit.com/spec](https://tezit.com/spec).*
*For questions, contact [consulting@tezit.com](mailto:consulting@tezit.com).*
