# Tez for Finance

**Tezit Protocol v1.2 -- Industry Guide**
**Audience**: Analysts, Portfolio Managers, Risk Officers, Compliance, Audit
**Last Updated**: February 2026

---

## Table of Contents

1. [The Problem in Finance](#the-problem-in-finance)
2. [How Tez Solves It](#how-tez-solves-it)
3. [Example: Equity Research Tez](#example-equity-research-tez)
4. [Example: Risk Assessment Tez](#example-risk-assessment-tez)
5. [Example: M&A Valuation Tez](#example-ma-valuation-tez)
6. [Getting Started](#getting-started)
7. [Compliance Considerations](#compliance-considerations)

---

## The Problem in Finance

Financial analysis is among the most context-dependent work in any profession. A single investment recommendation might synthesize hundreds of pages of filings, multiple data models, macro forecasts, industry reports, and management meeting notes. Yet the final deliverable -- the research report, the risk assessment, the valuation opinion -- arrives as a polished document that hides all of this machinery.

### Analyst reports share conclusions, not models

A sell-side analyst publishes a "Buy" recommendation on CloudTech Systems with a $142 price target. The two-page report mentions a DCF analysis, comparable company multiples, and management guidance. But the portfolio manager reading it can't see the actual DCF model, can't examine what discount rate was used, can't check whether the revenue growth assumptions are consistent with the comparable company data.

The analyst did rigorous work. The report format just doesn't transmit it.

### Investment committee decisions lack verifiable reasoning trails

When an investment committee approves a $50M allocation to a private credit fund, the decision is based on a due diligence memo, a presentation, and a discussion. Six months later, when the fund underperforms, the committee reviews the decision. But the memo is static -- it can't answer "What did we assume about default rates?" or "Did we consider the concentration risk in healthcare?" without someone re-reading the entire package and piecing together the reasoning.

The decision was made with rich context. It was recorded as a flat document.

### Risk assessments become stale but nobody knows which assumptions changed

A quarterly VaR report states that portfolio risk is within acceptable bounds. The report was built on assumptions about correlations, volatility regimes, and position sizing. By the time the next quarter arrives, three of those assumptions have shifted -- but the report doesn't flag which conclusions depend on which assumptions. The risk officer must manually trace the dependency chain, or worse, simply re-run the entire analysis.

### Auditors reverse-engineer reasoning from final reports

When internal audit or external examiners review an investment decision, they work backward from the final report, requesting supporting documents one at a time. "Can we see the model?" Then "What were the inputs to the model?" Then "Where did you source these inputs?" Each request requires the analyst to dig through files, emails, and saved workbooks to reconstruct a trail that existed naturally during the analysis but was never captured.

### Knowledge transfer between analysts is lossy

When a senior analyst covering the semiconductor sector leaves for a competitor, the incoming analyst inherits a folder of reports, a Bloomberg terminal, and some Excel models. What they don't inherit is the reasoning -- why the team uses a 10% discount rate instead of 12% for this sub-sector, why they weight management guidance more heavily for certain companies, why they view the competitor's bull case on memory pricing as flawed.

That institutional knowledge doesn't exist in any searchable, transmissible form. It walked out the door.

---

## How Tez Solves It

A Tez bundles the synthesis (your report, memo, or assessment) with the full context (data sources, models, industry reports, meeting notes) and the reasoning trail (the AI dialogue that helped produce the analysis). The result is a financial work product that recipients can interrogate, verify, and build upon.

### Research Reports as Tezits

Instead of publishing a PDF that references but doesn't include your model, you tezit the complete analysis:

```
cloudtech-initiation/
  manifest.json
  tez.md                          # The research report
  context/
    cloudtech-10k-2025.pdf
    cloudtech-10q-q3-2025.pdf
    cloudtech-earnings-transcript-q3.pdf
    management-meeting-notes-jan2026.md
    dcf-model.xlsx
    comparable-companies.xlsx
    industry-report-cloud-infrastructure-2026.pdf
    gartner-magic-quadrant-2025.pdf
    customer-survey-data.csv
    tam-analysis.xlsx
  conversation.json               # AI-assisted analysis dialogue
  params.json                     # Key assumptions (discount rate, growth, margins)
```

A portfolio manager receiving this Tez doesn't just get your recommendation. They get your entire analytical apparatus, interrogable through a single interface.

### Interrogation for Due Diligence

Portfolio managers and investment committee members can ask pointed questions that are answered from the actual model and data:

> **PM**: "What's the sensitivity of the valuation to a 200bp increase in the discount rate?"

**AI Response** (grounded in the DCF model): "The DCF model [[context/dcf-model.xlsx:assumptions]] uses a base WACC of 9.2%. Increasing by 200bp to 11.2% reduces the implied equity value from $142/share to $118/share, representing a 17% reduction. At $118, the stock would trade at 28x forward earnings versus the current peer median of 31x [[context/comparable-companies.xlsx:valuation_multiples]], placing it below the comparable range and weakening the Buy thesis."

This isn't the AI speculating. It's reading the actual model and data transmitted in the Tez.

### Living Documents

Financial tezits support linked data sources that flag when assumptions change:

```json
{
  "context": {
    "items": [
      {
        "id": "fed-funds-rate",
        "type": "live_data",
        "source": "fred_api",
        "last_value": "5.25",
        "last_updated": "2026-01-31",
        "alert_threshold": {
          "change_pct": 5,
          "message": "Fed funds rate has changed. Discount rate assumptions in DCF may need revision."
        }
      }
    ]
  }
}
```

When the Fed changes rates, every Tez that depends on that assumption gets flagged. Not the entire report -- the specific conclusions that depend on the changed input. This transforms stale reports into living analytical systems.

### Forking for Bull/Bear Cases

An analyst publishes a base case Tez with a Buy recommendation. A colleague who sees a different picture forks it:

```json
{
  "lineage": {
    "forked_from": "cloudtech-initiation-v2",
    "fork_type": "counter_thesis",
    "fork_label": "Bear Case",
    "parameter_overrides": {
      "revenue_growth_2027": "12%",
      "gross_margin_terminal": "68%",
      "customer_churn_rate": "18%"
    },
    "additions": [
      "competitor-pricing-analysis.pdf",
      "customer-churn-deep-dive.xlsx",
      "aws-market-share-erosion-data.csv"
    ]
  }
}
```

The bear case fork shares the same foundational data but adjusts key parameters and adds additional evidence. The investment committee can interrogate both the base case and the bear case, comparing assumptions side by side with full transparency into what changed and why.

---

## Example: Equity Research Tez

### The Scenario

Your firm is initiating coverage on NovaBio Therapeutics, a mid-cap biotech company with three compounds in Phase II/III trials. The initiating report recommends "Overweight" with a $78 price target.

### The Synthesis: Research Report

```markdown
# NovaBio Therapeutics (NVBT) -- Initiating Coverage

**Rating**: Overweight
**Price Target**: $78 (46% upside)
**Current Price**: $53.40
**Market Cap**: $4.2B

## Investment Thesis

NovaBio's pipeline represents an asymmetric risk/reward opportunity.
The market is pricing in approximately one successful Phase III readout
based on our sum-of-the-parts analysis [[context/sotp-model.xlsx]].
We believe two of three compounds have >60% probability of approval,
implying significant upside.

### Key Compound: NBT-4100 (Oncology)

Phase II data [[context/nbt4100-phase2-results.pdf]] showed a 34% ORR
in second-line NSCLC, comparing favorably to the 27% ORR reported by
Keytruda in a similar population [[context/keynote-789-publication.pdf:table3]].
The safety profile [[context/nbt4100-safety-data.pdf]] shows manageable
adverse events with no Grade 4+ treatment-related events in 142 patients.

We model peak sales of $2.8B based on:
- Addressable market of 180,000 patients/year in US + EU
  [[context/nsclc-epidemiology-report.pdf]]
- 15% peak market share (conservative vs. Keytruda's 32% in 1L)
- $165,000 WAC price point [[context/pricing-analysis.xlsx]]

### Key Compound: NBT-2200 (Autoimmune)

Phase II data in moderate-to-severe Crohn's disease [[context/nbt2200-crohns-data.pdf]]
demonstrated 42% clinical remission at week 12, superior to the 35%
achieved by Skyrizi in ADVANCE [[context/skyrizi-advance-publication.pdf]].

We model peak sales of $1.9B. However, the competitive landscape is
crowding: four additional IL-23 inhibitors are in Phase II/III
[[context/il23-competitive-landscape.xlsx]].

### Valuation

Our probability-adjusted DCF [[context/dcf-model.xlsx]] yields a
per-share value of $78, comprised of:
- NBT-4100: $42/share (65% PoS)
- NBT-2200: $24/share (55% PoS)
- NBT-3300: $5/share (30% PoS)
- Pipeline optionality: $3/share
- Cash: $4/share (current $580M [[context/novabio-10q-q3-2025.pdf:p6]])

### Key Risks

1. **Binary clinical risk**: Phase III readout for NBT-4100 expected
   Q3 2026. Failure would reduce fair value to ~$28/share.
2. **Financing risk**: Current cash runway extends to Q4 2027
   [[context/cash-runway-analysis.xlsx]]. If NBT-4100 fails, the company
   will need to raise capital at a discount.
3. **Competitive displacement**: Merck's next-gen checkpoint inhibitor
   entering Phase III could erode NBT-4100's addressable market
   [[context/merck-pipeline-analysis.pdf]].
```

### Interrogation by the Portfolio Manager

> **PM**: "How sensitive is the price target to NBT-4100 probability of success? What if you cut it to 40%?"

**AI Response**: "The base case assigns NBT-4100 a 65% probability of success, contributing $42/share to the $78 target [[context/dcf-model.xlsx:sotp_summary]]. Reducing PoS to 40% would reduce the NBT-4100 contribution to approximately $26/share (proportional adjustment), bringing the total target to ~$62. At $62, the stock still offers 16% upside from $53.40, which would likely move the recommendation to 'Equal Weight' under the firm's framework. The key inflection point is at approximately 48% PoS, where the target approaches the current stock price [[context/dcf-model.xlsx:sensitivity_table]]."

> **PM**: "The Crohn's data looks strong, but how does NBT-2200 compare to the Roche IL-23 in Phase III?"

**AI Response**: "The competitive landscape analysis [[context/il23-competitive-landscape.xlsx]] shows the Roche compound (RG-7880) reported 39% clinical remission at week 12 in their Phase III GALAXY-1 trial, compared to NBT-2200's 42% in Phase II. However, cross-trial comparisons are unreliable due to differences in patient populations and baseline disease severity. The NovaBio Phase II enrolled patients with a mean CDAI of 312 [[context/nbt2200-crohns-data.pdf:table1]], while GALAXY-1's mean was 298. The higher baseline severity in NovaBio's trial makes the 42% remission rate potentially more impressive, though a head-to-head would be needed to confirm superiority."

### Bear Case Fork

A colleague creates a bear case:

```markdown
# NovaBio Therapeutics -- Bear Case Fork

**Rating**: Underweight
**Price Target**: $31
**Forked from**: novabio-initiation-v1

## Counter-Thesis

The base case overestimates NBT-4100's commercial opportunity and
underestimates competitive risk.

### Point 1: Phase II ORR is misleading

The 34% ORR in Phase II included 8 patients with confirmed PD-L1
TPS >50% [[context/nbt4100-phase2-results.pdf:supplementary_table_2]],
who drove a disproportionate share of responses. In the PD-L1 <1%
subgroup (which represents the real commercial opportunity), ORR was
only 19% -- comparable to docetaxel.

### Point 2: Pricing assumptions are aggressive

The $165,000 WAC assumes parity with established checkpoint inhibitors.
As a second-line agent from a small biotech, formulary access will
require significant discounts. Comparable launches suggest realized
net price of $110-125,000 [[context/biotech-launch-pricing-comps.xlsx]].

### Revised Valuation

Using 45% PoS for NBT-4100 (reflecting subgroup concerns), $120K net
price, and 10% peak share, our bear case DCF yields $31/share
[[context/bear-case-dcf-model.xlsx]].
```

The investment committee can now interrogate both tezits, asking the same questions against different evidence bases, and make a decision with full transparency into both perspectives.

---

## Example: Risk Assessment Tez

### The Scenario

The Chief Risk Officer requests a quarterly portfolio risk assessment for a $2.3B multi-strategy fund. The risk team must deliver an assessment that covers market risk, credit risk, liquidity risk, and concentration risk.

### The Synthesis

```markdown
# Q4 2025 Portfolio Risk Assessment

**Fund**: Meridian Multi-Strategy Fund
**AUM**: $2.3B as of December 31, 2025
**Report Date**: January 15, 2026

## Executive Summary

Portfolio risk metrics are within policy limits, with two areas
requiring attention:

1. **Concentration in healthcare credit** has reached 18% of NAV
   [[context/position-data-q4.xlsx:sector_summary]], approaching the
   20% policy limit [[context/ips-risk-limits.pdf:s4.3]].

2. **Liquidity mismatch** in the private credit sleeve has increased.
   Days-to-liquidate for the bottom quartile of positions has extended
   from 45 to 73 days [[context/liquidity-analysis.xlsx:dtl_summary]],
   driven by the Arcturus Healthcare facility and two CLO equity tranches.

## Market Risk

### Value at Risk

| Metric | Q4 2025 | Q3 2025 | Policy Limit |
|--------|---------|---------|--------------|
| 1-day 95% VaR | $18.2M (0.79%) | $16.8M (0.73%) | 1.5% |
| 1-day 99% VaR | $29.4M (1.28%) | $27.1M (1.18%) | 2.5% |
| 10-day 99% VaR | $72.8M (3.17%) | $65.3M (2.84%) | 5.0% |

VaR has increased primarily due to elevated equity volatility following
the December FOMC meeting [[context/market-data-q4.xlsx:vol_surface]].
The increase is directionally expected and within tolerance.

### Stress Testing

Scenario analysis results [[context/stress-test-results.xlsx]]:

| Scenario | P&L Impact | Worst Sleeve |
|----------|-----------|--------------|
| 2008 GFC Replay | -$312M (-13.6%) | Long/Short Equity |
| COVID-style shock | -$198M (-8.6%) | Private Credit |
| Rates +300bp | -$167M (-7.3%) | Fixed Income Arb |
| EM crisis | -$89M (-3.9%) | Macro |

## Credit Risk

The portfolio's credit exposure is detailed in
[[context/credit-exposure-report.xlsx]]. Key observations:

- Weighted average credit rating: BB+ (unchanged from Q3)
- Single-name concentration: largest single credit exposure is
  Arcturus Healthcare at 3.1% of NAV, within the 5% limit
- Sector concentration: healthcare credit at 18% approaches the
  20% limit. Contributing positions detailed in
  [[context/healthcare-credit-positions.xlsx]]
```

### Interrogation by Compliance

> **Compliance Officer**: "Which specific positions are driving the healthcare concentration, and what would need to be sold to bring it below 15%?"

**AI Response**: "Healthcare credit positions [[context/healthcare-credit-positions.xlsx]] totaling $414M (18% of NAV) consist of: Arcturus Healthcare senior secured ($71.3M), HealthFirst CLO equity ($48.2M), MedTech Capital term loan ($39.7M), and 14 additional positions ranging from $8M to $32M. To reduce from 18% to 15% would require selling approximately $69M in healthcare credit. The most liquid candidates are the HealthFirst CLO mezzanine tranche ($28.5M, estimated 3-5 day liquidation) and the Cardinal Health bonds ($22.1M, same-day liquidation), which together would bring concentration to approximately 15.8%. Reaching exactly 15% would require partial reduction of one additional position."

> **Compliance Officer**: "The liquidity mismatch in private credit -- does this violate the IPS?"

**AI Response**: "The Investment Policy Statement [[context/ips-risk-limits.pdf:s6.2]] requires that 'no more than 15% of NAV shall be held in positions requiring greater than 60 days to liquidate under normal market conditions.' The current 73-day DTL applies to the bottom quartile of the private credit sleeve, which represents approximately $180M or 7.8% of NAV. However, the specific positions exceeding 60 days are the Arcturus Healthcare facility ($71.3M, estimated 90 days) and two CLO equity tranches ($48.2M and $31.4M, estimated 75-80 days), totaling $150.9M or 6.6% of NAV. This is within the 15% policy limit, but trending in a direction that warrants monitoring. The IPS does not set a specific DTL threshold for individual positions."

---

## Example: M&A Valuation Tez

### The Scenario

Your team has been retained to provide a fairness opinion for the board of Summit Technologies in connection with a proposed $2.1B acquisition by Orion Industries.

### The Synthesis

```markdown
# Fairness Opinion Analysis -- Summit Technologies / Orion Industries

## Opinion Summary

Based on the analyses described herein, and subject to the qualifications
and limitations stated, it is our opinion that the consideration of
$47.50 per share to be received by Summit shareholders is **fair from
a financial point of view**.

## Valuation Summary

| Methodology | Low | Mid | High |
|-------------|-----|-----|------|
| DCF (WACC 8.5-10.5%) | $39.20 | $46.80 | $55.40 |
| Comparable Companies | $41.30 | $48.60 | $54.10 |
| Comparable Transactions | $43.70 | $51.20 | $59.80 |
| 52-Week Trading Range | $31.40 | -- | $44.20 |
| **Implied Range** | **$39.20** | **$48.90** | **$59.80** |

The offered price of $47.50 falls within the implied valuation range
and is within 3% of the midpoint of our DCF analysis.

## DCF Analysis

Key assumptions [[context/dcf-model.xlsx:assumptions_tab]]:
- Revenue CAGR 2026-2030: 14.2% (based on management projections
  [[context/summit-management-projections.pdf]] cross-referenced with
  industry growth data [[context/cloud-security-market-forecast.pdf]])
- Terminal EBITDA margin: 32% (compared to mature SaaS peers at 30-38%
  [[context/comparable-companies.xlsx:margin_analysis]])
- WACC: 9.5% (midpoint), using beta of 1.15 derived from peer group
  regression [[context/beta-calculation.xlsx]]

## Comparable Transactions

We identified 12 relevant transactions in cloud security and enterprise
SaaS over the past 3 years [[context/comparable-transactions.xlsx]].
Key multiples:

| Metric | 25th Pct | Median | 75th Pct | Summit (at $47.50) |
|--------|----------|--------|----------|---------------------|
| EV/Revenue (NTM) | 6.8x | 8.2x | 10.1x | 8.7x |
| EV/EBITDA (NTM) | 22.4x | 28.1x | 33.6x | 27.3x |

Summit's implied multiples at $47.50 are near the median for
comparable transactions, consistent with its growth and margin profile.

## Premium Analysis

The $47.50 offer represents a 31% premium to Summit's unaffected
closing price of $36.25 [[context/summit-stock-data.xlsx]].
Comparable acquisition premiums [[context/premium-analysis.xlsx]]
range from 22% to 48% with a median of 33%.
```

### Interrogation by the Board

> **Board Member**: "Is the DCF sensitive to the revenue growth assumption? What if Orion's competing product takes market share?"

**AI Response**: "The DCF is materially sensitive to revenue growth. The base case uses a 14.2% CAGR, which is based on management's projections [[context/summit-management-projections.pdf]]. Reducing the CAGR to 10% (reflecting competitive pressure) reduces the DCF midpoint from $46.80 to approximately $38.50, placing the $47.50 offer above the top of the revised DCF range. Under this scenario, the offer price would represent a premium to intrinsic value. Conversely, the cloud security market forecast [[context/cloud-security-market-forecast.pdf:p23]] projects industry growth of 16-18% through 2028, suggesting management's 14.2% assumption is already somewhat conservative relative to the broader market. Orion's competing product is referenced in the competitive landscape analysis [[context/competitive-landscape.pdf:p8]] but is currently pre-revenue and unlikely to impact Summit's 2026-2027 projections materially."

---

## Getting Started

### Creating Financial Tezits

1. **Start with a completed analysis**. Take an existing research report, risk assessment, or valuation and gather the supporting materials:
   - The report or memo (PDF, Word, or Markdown)
   - Excel models and workbooks
   - Source data files (CSV, JSON)
   - Industry reports and third-party research
   - Meeting notes and call transcripts
   - Regulatory filings (10-K, 10-Q, proxy statements)

2. **Create the bundle structure**:
   ```
   my-analysis-tez/
     manifest.json
     tez.md                    # The report/memo
     context/
       models/
         dcf-model.xlsx
         comparable-companies.xlsx
       filings/
         target-10k-2025.pdf
         target-10q-q3-2025.pdf
       research/
         industry-report.pdf
         management-meeting-notes.md
       data/
         market-data.csv
         position-data.xlsx
   ```

3. **Add the manifest**:
   ```json
   {
     "tezit_version": "1.2",
     "id": "cloudtech-equity-research-2026-02",
     "title": "CloudTech Systems -- Initiating Coverage",
     "created_at": "2026-02-05T09:00:00Z",
     "creator": {
       "name": "Sarah Chen",
       "org": "Meridian Securities"
     },
     "synthesis": {
       "file": "tez.md",
       "type": "equity_research"
     },
     "profile": "knowledge",
     "parameters": {
       "negotiable": true,
       "file": "params.json"
     }
   }
   ```

4. **Define adjustable parameters** in `params.json`:
   ```json
   {
     "parameters": [
       {
         "id": "discount_rate",
         "label": "WACC",
         "type": "percentage",
         "current": 9.5,
         "range": { "min": 7.0, "max": 14.0 },
         "impact": "DCF valuation, price target"
       },
       {
         "id": "revenue_growth",
         "label": "Revenue CAGR 2026-2030",
         "type": "percentage",
         "current": 14.2,
         "range": { "min": 5.0, "max": 25.0 },
         "impact": "Revenue projections, DCF valuation"
       },
       {
         "id": "terminal_margin",
         "label": "Terminal EBITDA Margin",
         "type": "percentage",
         "current": 32.0,
         "range": { "min": 25.0, "max": 40.0 },
         "impact": "Terminal value, DCF valuation"
       }
     ]
   }
   ```

### Best Practices for Embedding Models and Data

- **Include the actual Excel file, not a PDF export.** Interrogation is dramatically more powerful when the AI can read formulas, trace dependencies, and calculate sensitivities from the live model.
- **Use named ranges in Excel.** The AI can reference `=revenue_2027` more reliably than `=Sheet3!B14`.
- **Include raw data alongside transformed data.** If your model depends on a Bloomberg data pull, include the raw export so recipients can verify your inputs.
- **Document model assumptions explicitly.** Create an "assumptions" tab in every model workbook. The AI will use this as a primary reference when answering questions about methodology.

### Handling Sensitive Financial Data

- **MNPI controls**: Use the Tez permissions system to restrict access to material non-public information. Set explicit access lists and disable resharing.
  ```json
  {
    "permissions": {
      "interrogate": ["investment_committee", "compliance"],
      "fork": ["investment_committee"],
      "reshare": false,
      "classification": "MNPI",
      "information_barrier": "research_to_trading"
    }
  }
  ```
- **Client data**: For buy-side tezits containing portfolio data, use `"visibility": "internal"` and ensure the Tez is not stored on shared infrastructure.
- **Model IP**: Proprietary models can be included as context but marked as non-exportable, allowing interrogation without allowing the recipient to download the raw workbook.

### Regulatory Considerations

- **MiFID II**: Research tezits distributed to EU clients must comply with MiFID II unbundling requirements. The Tez audit trail satisfies the record-keeping requirement for research interactions.
- **SEC Regulation AC**: Analyst certifications can be embedded in the Tez manifest, and the conversation record provides evidence of the analyst's independent judgment.
- **FINRA**: The structured format facilitates supervisory review required under FINRA Rules 2241 and 2242.

---

## Compliance Considerations

### Audit Trail Requirements

Financial regulators require that firms maintain records of the basis for investment decisions and recommendations. The Tez format is purpose-built for this:

1. **Decision provenance**: The conversation record (`conversation.json`) documents the analytical process -- what data was examined, what questions were asked, what alternatives were considered. This is the reasoning trail that regulators look for during examinations.

2. **Source verification**: Every claim in the synthesis links to a specific context item. Auditors can verify any statement by clicking through to the source rather than requesting documents one at a time.

3. **Immutable record**: Once a Tez is finalized and shared, its content is hashed and timestamped. The manifest records the hash of every context item:
   ```json
   {
     "context": {
       "items": [
         {
           "id": "dcf-model",
           "file": "context/models/dcf-model.xlsx",
           "hash": "sha256:a1b2c3d4..."
         }
       ]
     }
   }
   ```
   This provides cryptographic proof that the model used at the time of the recommendation matches what is produced during an audit.

### Record Retention (SEC Rule 17a-4)

SEC Rule 17a-4 requires broker-dealers to retain business records, including communications and analyses related to their business. Tezits satisfy this in several ways:

- **Self-contained**: A Tez bundles the report, sources, models, and reasoning into a single archivable unit. No risk of the model being saved in one system, the report in another, and the source data in a third.
- **WORM compliance**: The Tez hashing mechanism supports Write Once, Read Many storage. Once finalized, a Tez can be committed to compliant storage with integrity verification.
- **Retention scheduling**: Tezits can be tagged with retention metadata:
  ```json
  {
    "retention": {
      "policy": "sec-17a-4",
      "category": "research_report",
      "retain_until": "2032-02-05",
      "destruction_hold": false
    }
  }
  ```

### Research Independence Requirements

For sell-side research, independence is paramount. The Tez format supports this:

- **Separation of context**: Research tezits can be configured to prevent banking-side context from being included, enforcing information barriers at the bundle level.
- **Certification embedding**: Analyst certifications required by Regulation AC can be included as a signed context item, linked to the synthesis.
- **Review trail**: The conversation record shows that the analyst's conclusions were derived from public information and independent analysis, providing evidence of compliance during examinations.

### Model Risk Management (SR 11-7)

The Federal Reserve's SR 11-7 guidance on model risk management requires firms to validate models, document assumptions, and monitor performance. Tezits align naturally:

- **Model documentation**: The Tez bundles the model with its documentation. The assumptions tab, the data sources, and the analytical reasoning are all present in a single unit. This satisfies the "effective challenge" requirement because validators can interrogate the Tez to understand model behavior without relying on the model developer's verbal explanation.

- **Assumption tracking**: The `params.json` file explicitly lists every adjustable assumption with its current value and acceptable range. When assumptions change, the living document feature flags which conclusions are affected.

- **Back-testing evidence**: Historical tezits serve as a record of what was predicted and on what basis. Comparing a Q1 2025 forecast Tez against actual Q1 results is straightforward because the original assumptions are preserved.

- **Change management**: When a model is updated, the new Tez forks from the previous version, making the exact changes visible:
  ```json
  {
    "lineage": {
      "forked_from": "var-model-v3.2",
      "fork_type": "model_update",
      "changes": [
        "Updated correlation matrix with 2025 data",
        "Added crypto exposure to stress scenarios",
        "Revised liquidity assumptions for private credit"
      ]
    }
  }
  ```

### Cross-Border Considerations

| Regulation | How Tez Helps |
|---|---|
| **MiFID II** (EU) | Research unbundling compliance; structured record of research consumed |
| **SEC Reg AC** (US) | Analyst certification embedded with verifiable independence trail |
| **FINRA 2241/2242** (US) | Supervisory review facilitated by interrogable work product |
| **FCA COBS** (UK) | Clear, fair, and not misleading standard met through source transparency |
| **MAS Guidelines** (Singapore) | Risk management documentation requirements satisfied by bundled analysis |
| **HKMA SPM** (Hong Kong) | Model validation and documentation requirements aligned with SR 11-7 approach |

---

## Why This Matters

The financial industry generates more analytical work product per capita than almost any other profession. Every day, thousands of analysts write reports, build models, assess risks, and make recommendations. The vast majority of this work is consumed once and then filed in a system where it slowly becomes unretrievable.

A Tez changes the economics of financial analysis. The work you do today doesn't just inform today's decision -- it becomes an interrogable asset that compounds in value. Next quarter's risk assessment starts from this quarter's Tez, with full visibility into what changed. Next year's coverage initiation builds on this year's industry analysis. The new analyst covering your sector doesn't start from zero -- they start from an interrogable library of your reasoning.

For compliance, the Tez is the audit trail you always wished you had. For investment committees, it's the transparency that makes better decisions possible. For clients, it's the verifiability that builds trust.

That's what "GitHub for knowledge work" means for finance: version-controlled, forkable, interrogable analysis where the reasoning is as durable as the conclusion.

---

*This guide is part of the Tezit Protocol v1.2 industry series. For the full protocol specification, visit [tezit.com/spec](https://tezit.com/spec).*
*For questions, contact [finance@tezit.com](mailto:finance@tezit.com).*
