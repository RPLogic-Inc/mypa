# Tez for Legal

**Tezit Protocol v1.2 -- Industry Guide**
**Audience**: Partners, Associates, Legal Operations, General Counsel
**Last Updated**: February 2026

---

## Table of Contents

1. [The Problem in Legal](#the-problem-in-legal)
2. [How Tez Solves It](#how-tez-solves-it)
3. [Example: M&A Due Diligence Tez](#example-ma-due-diligence-tez)
4. [Example: Litigation Brief Tez](#example-litigation-brief-tez)
5. [Getting Started](#getting-started)
6. [Compliance Considerations](#compliance-considerations)

---

## The Problem in Legal

Legal work is knowledge work at its most rigorous. Every conclusion must trace to authority. Every recommendation must survive adversarial scrutiny. And yet the tools lawyers use to transmit their work -- memos, briefs, emails -- systematically strip away the very scaffolding that makes legal reasoning verifiable.

### Legal memos cite cases but don't include them

A partner receives a 15-page research memo on whether a non-compete clause is enforceable in California. The memo cites *Edwards v. Arthur Andersen LLP*, 44 Cal.4th 937 (2008), and *The Retirement Group v. Galante*, 176 Cal.App.4th 1226 (2009). To verify the associate's analysis, the partner must pull up each case independently, re-read the relevant sections, and determine whether the characterization is accurate.

This isn't paranoia. It's professional obligation. But the memo format makes verification tedious by design -- it references authority without transmitting it.

### Associates spend hours re-researching what partners already analyzed

When a new matter arrives that touches on CFIUS review requirements, the assigning partner knows the firm handled a similar question eighteen months ago. But the original memo lives in a document management system, detached from the research that produced it. The new associate must reconstruct the analysis from scratch -- pulling the same cases, reading the same regulations, arriving at the same conclusions the firm already paid for once.

The firm's collective knowledge exists, but it's locked in static documents that can't be queried.

### Client communications lose nuance in summarization

A general counsel asks outside counsel: "What's our exposure on this patent claim?" The response is a three-paragraph email summarizing a 40-page analysis. The nuances -- the split circuit authority, the factual distinctions that could go either way, the litigation strategy that depends on which judge is assigned -- collapse into "moderate risk with mitigation options."

The client received a conclusion. They needed a reasoning trail.

### Opposing counsel can't verify your reasoning efficiently

In negotiation and litigation, persuasion depends on the other side being able to verify your position. When you send a brief citing 30 cases, opposing counsel must independently locate and verify each one. This adversarial inefficiency is treated as a feature of the system, but it wastes time on both sides and rewards obfuscation over transparency.

### Knowledge transfer when lawyers leave is catastrophic

When a senior associate departs, they take with them not just client relationships but the institutional reasoning that informed years of advice. The documents remain, but the "why" behind each strategic decision -- which arguments were considered and rejected, which precedents were deemed distinguishable, which client concerns shaped the approach -- vanishes.

A departing lawyer's document trail is an archive. What the firm needed was an interrogable knowledge base.

---

## How Tez Solves It

A Tez is a bundle that transmits knowledge with its complete scaffolding: the synthesis (your memo, brief, or analysis), the context (cases, statutes, contracts, correspondence), and the reasoning (the AI-assisted research dialogue that produced the work product). Recipients don't just read your conclusion -- they can interrogate it, verify it, and build on it.

### Legal Memos as Tezits

Instead of sending a memo that cites *Edwards v. Arthur Andersen*, you tezit the entire work product:

```
m-and-a-noncompete-analysis/
  manifest.json
  tez.md                    # The research memo
  context/
    edwards-v-arthur-andersen.pdf
    retirement-group-v-galante.pdf
    cal-bus-prof-code-16600.pdf
    client-employment-agreement.pdf
    comparable-clauses-analysis.xlsx
  conversation.json          # The research dialogue
  params.json                # Key assumptions (jurisdiction, role level, etc.)
```

The partner who receives this Tez can:
- Read the memo exactly as before
- Click any citation to view the actual source
- Ask questions: "Does Edwards apply if the employee was a C-suite executive?"
- Verify that the characterization of *Retirement Group* is accurate
- Fork the Tez to add a new fact pattern from another client

The memo is no longer a dead document. It's a live, interrogable work product.

### Interrogation for Due Diligence

When a client receives a due diligence report as a Tez, they can ask questions directly:

> **Client**: "Does this analysis cover regulatory risk in the EU under the Digital Markets Act?"

The AI answers from the actual context -- the documents, filings, and research that produced the report. If the answer is "This analysis focused on US regulatory risk; EU DMA exposure was not assessed," the client knows immediately what additional work is needed. No phone call. No email chain. No waiting for a partner to check with the associate who did the work.

### Forking for Opposing Arguments

In litigation, forking is transformative. Imagine the prosecution shares its evidence summary as a Tez. Defense counsel forks it -- starting with the same evidence base but adding:

- Exculpatory evidence the prosecution omitted
- Alternative interpretations of witness testimony
- Expert reports that contradict prosecution experts
- Case law supporting the defense theory

The fork maintains lineage to the original, so the court can see exactly where the positions diverge and what additional evidence each side introduced. This is structured dialectic, not adversarial document exchange.

```json
{
  "lineage": {
    "forked_from": "prosecution-evidence-summary-v2",
    "fork_type": "counter_position",
    "additions": [
      "defense-expert-report-williams.pdf",
      "witness-chen-full-deposition.pdf",
      "people-v-martinez-2024.pdf"
    ],
    "modifications": [
      "Alternative interpretation of timeline evidence"
    ]
  }
}
```

### Precedent Libraries

Over time, a firm builds a vault of tezits -- not just memos, but interrogable analyses with their supporting research intact. When a new question arises about force majeure clauses in supply chain contracts, an associate doesn't start from scratch. They query the vault:

> **Associate**: "What positions has this firm taken on force majeure in the context of pandemic-related supply disruptions?"

The AI searches across all relevant tezits -- pulling from the actual analyses, cited cases, and reasoning trails -- and provides a grounded answer with citations to specific work product. This isn't a keyword search across a DMS. It's semantic interrogation of the firm's accumulated reasoning.

---

## Example: M&A Due Diligence Tez

### The Scenario

Meridian Capital is acquiring DataStream Analytics for $340M. Your firm represents Meridian. The associate team has completed due diligence and must transmit findings to the deal team, the client's board, and eventually to financing parties.

### The Synthesis: Risk Assessment Memo

The `tez.md` is the deliverable -- a structured risk assessment:

```markdown
# DataStream Analytics -- Acquisition Due Diligence Report

## Deal Summary
- **Target**: DataStream Analytics, Inc. (Delaware)
- **Consideration**: $340M (cash + stock)
- **Closing Conditions**: HSR clearance, key employee retention, IP assignment confirmation

## Executive Risk Assessment

### HIGH RISK: Intellectual Property Ownership Gaps

DataStream's core recommendation engine was developed in part by three engineers
who were previously employed by Cascade Systems. Review of employment agreements
[[context/cascade-employment-agreements.pdf]] reveals that two of the three
engineers had broad IP assignment clauses covering "any invention related to
the company's business." Cascade's business description [[context/cascade-10k-2023.pdf:p14]]
includes "data analytics and machine learning applications."

Comparison with DataStream's own IP assignment records [[context/datastream-ip-assignments.pdf]]
shows assignment dates that postdate the engineers' Cascade departure by only
47 days. This creates a colorable claim by Cascade to co-ownership of core IP.

**Recommended mitigation**: Obtain IP indemnification from sellers; require
representation that no third-party claims exist; consider escrow holdback
of $15-20M pending 18-month claim window.

### MODERATE RISK: Revenue Concentration

Top 3 customers represent 61% of ARR [[context/datastream-financials-2025.pdf:p8]].
Customer contracts analysis [[context/customer-contracts-summary.xlsx]] reveals
that the largest customer (HealthFirst, 28% of ARR) has a termination-for-convenience
clause with 90-day notice [[context/healthfirst-msa.pdf:s4.2]].

### MODERATE RISK: Pending Litigation

Active patent infringement suit filed by NovaTech IP Holdings
[[context/novatech-complaint.pdf]]. Analysis of asserted claims against
DataStream's architecture [[context/technical-claim-mapping.pdf]] suggests
two of six claims present non-trivial infringement risk. Estimated exposure:
$8-15M based on comparable settlements [[context/patent-settlement-comparables.xlsx]].

### LOW RISK: Regulatory Compliance

GDPR compliance audit [[context/gdpr-audit-report.pdf]] identified 3 minor
findings, all remediated. No state AG investigations. SOC 2 Type II current
through Q1 2026 [[context/soc2-report.pdf]].
```

### The Context Bundle

```
datastream-due-diligence/
  context/
    # Corporate Documents
    datastream-certificate-of-incorporation.pdf
    datastream-bylaws.pdf
    datastream-board-minutes-2024-2025.pdf

    # IP Materials
    cascade-employment-agreements.pdf
    datastream-ip-assignments.pdf
    patent-portfolio-summary.pdf
    technical-claim-mapping.pdf
    cascade-10k-2023.pdf

    # Financial Materials
    datastream-financials-2025.pdf
    datastream-financials-2024.pdf
    customer-contracts-summary.xlsx
    healthfirst-msa.pdf
    revenue-projection-model.xlsx

    # Litigation Materials
    novatech-complaint.pdf
    patent-settlement-comparables.xlsx
    litigation-reserve-analysis.pdf

    # Regulatory Materials
    gdpr-audit-report.pdf
    soc2-report.pdf
    data-processing-agreements/
```

### How Interrogation Works

Once Meridian's board receives the Tez, board members can interrogate it directly:

> **Board Member**: "What are the material risks not explicitly covered in this assessment?"

**AI Response** (grounded in context): "Based on the transmitted materials, the following areas appear to have limited coverage: (1) Environmental liabilities -- no Phase I assessment was included in the context; (2) Tax exposure -- while financials are present, no specific tax diligence memo or state tax nexus analysis was included; (3) Employee benefit plan compliance -- no ERISA audit or benefits summary was provided. These gaps do not necessarily indicate risk; they indicate areas where additional diligence materials may need to be requested or are being handled by other workstreams."

> **Board Member**: "If Cascade asserts an IP claim, what's our worst-case timeline to resolution?"

**AI Response**: "Based on the employment agreement analysis [[cascade-employment-agreements.pdf]] and comparable IP disputes in the patent settlement data [[patent-settlement-comparables.xlsx]], a contested ownership claim would likely take 18-30 months to resolve through litigation. However, the complaint in the NovaTech matter [[novatech-complaint.pdf]] suggests a parallel litigation track that could compress settlement dynamics if both IP disputes are active simultaneously. The recommended $15-20M escrow holdback in the synthesis is calibrated to the upper range of comparable settlements."

### How Forking Works

Meridian's financing bank receives the due diligence Tez and forks it to add their own independent analysis:

```json
{
  "lineage": {
    "forked_from": "datastream-due-diligence-v3",
    "fork_type": "supplemental_analysis",
    "forked_by": "First National Bank -- Credit Analysis",
    "additions": [
      "independent-ip-valuation.pdf",
      "credit-risk-model-output.xlsx",
      "industry-comp-analysis.pdf",
      "bank-internal-rating-memo.pdf"
    ]
  }
}
```

The bank's fork inherits all the original context but layers on their independent credit analysis. Their credit committee can interrogate across both the law firm's diligence and the bank's own analysis in a single interface.

---

## Example: Litigation Brief Tez

### The Scenario

Your client, Apex Manufacturing, is moving to dismiss a breach of contract claim brought by Sterling Distributors. Sterling alleges Apex failed to deliver minimum quantities under a 2023 supply agreement.

### The Synthesis: Motion to Dismiss

```markdown
# Motion to Dismiss -- Sterling Distributors v. Apex Manufacturing

## Summary of Argument

Sterling's complaint fails to state a claim for breach of contract because:

1. **The Agreement Contains an Express Force Majeure Clause**
   The Supply Agreement [[context/supply-agreement-2023.pdf:s8.1]] defines
   force majeure to include "disruptions to supply chain, raw material
   shortages, and governmental actions affecting production capacity."
   The Q3 2024 semiconductor shortage that caused delivery shortfalls
   falls squarely within this provision.

2. **Sterling Failed to Satisfy Conditions Precedent**
   Section 3.4 of the Agreement [[context/supply-agreement-2023.pdf:s3.4]]
   requires Sterling to provide 90-day rolling forecasts as a condition
   to Apex's delivery obligations. Sterling's own communications
   [[context/sterling-forecast-emails.pdf]] demonstrate that forecasts
   were provided late or not at all for Q2-Q3 2024.

3. **Damages Are Speculative**
   Sterling's claimed lost profits depend on resale contracts that
   were not in existence at the time of alleged breach. Sterling's
   own financial records [[context/sterling-financials-excerpt.pdf]]
   show no executed downstream contracts for the quantities at issue.

## Supporting Authority

- *Hess Corp. v. Port Authority Trans-Hudson*, 2024 WL 1234567
  (S.D.N.Y. 2024) -- Force majeure clause enforced for supply
  chain disruption [[context/hess-v-path.pdf]]

- *TechCom Solutions v. Pinnacle Mfg.*, 45 F.4th 892 (3d Cir. 2023)
  -- Condition precedent not excused where buyer failed to provide
  required forecasts [[context/techcom-v-pinnacle.pdf]]

- *Kenford Co. v. County of Erie*, 67 N.Y.2d 257 (1986) -- Lost
  profits must be established with reasonable certainty
  [[context/kenford-v-erie.pdf]]
```

### How the Judge's Clerk Uses Interrogation

The motion is filed as a Tez. The judge's clerk can verify every citation without leaving the interface:

> **Clerk**: "Does the Hess v. Port Authority case actually hold that semiconductor shortages qualify as force majeure?"

**AI Response**: "The Hess decision [[context/hess-v-path.pdf]] addressed supply chain disruptions broadly, holding that 'unforeseen disruptions to the global supply chain' triggered the force majeure provision in that contract. The court did not specifically address semiconductor shortages. However, the court's analysis at pages 12-14 focused on whether the disruption was 'beyond the reasonable control of the affected party' and whether the party took 'commercially reasonable efforts to mitigate,' which are the same analytical factors that would apply to a semiconductor shortage claim."

> **Clerk**: "Did Sterling actually fail to provide the required forecasts, or is Apex characterizing the evidence selectively?"

**AI Response**: "Based on the email correspondence in context [[context/sterling-forecast-emails.pdf]], Sterling provided forecasts for Q1 2024 on time (January 3, 2024). The Q2 forecast was provided on April 18, 2024 -- 18 days past the contractual deadline of March 31 under Section 3.4 [[context/supply-agreement-2023.pdf:s3.4]]. No Q3 forecast appears in the transmitted materials. The synthesis characterizes forecasts as 'provided late or not at all for Q2-Q3 2024,' which is consistent with the documentary evidence, though the Q2 forecast was provided (late) rather than not at all."

This level of verification -- instant, grounded, citing specific pages -- transforms how courts can evaluate legal arguments.

### Opposing Counsel Forks

Sterling's counsel receives the motion Tez and forks it to prepare the opposition:

```
sterling-opposition-fork/
  context/
    # Inherited from Apex's Tez
    supply-agreement-2023.pdf
    sterling-forecast-emails.pdf
    hess-v-path.pdf
    ...

    # Sterling's additions
    apex-internal-emails-production.pdf      # Apex knew about shortage early
    sterling-q3-forecast-draft.pdf           # Forecast was sent but bounced
    apex-delivery-to-other-customers.pdf     # Apex delivered to competitors
    downstream-contracts-executed.pdf        # Sterling DID have resale contracts
    rochester-v-katayama-force-majeure.pdf   # Limiting authority on force majeure
```

The fork makes the dialectic visible. Both parties' arguments stand side by side, grounded in transmitted evidence, interrogable by the court.

---

## Getting Started

### Step 1: Creating Your First Legal Tez

Start with a research memo you've already written. The fastest path:

1. **Gather your materials**:
   - The memo itself (Word, PDF, or Markdown)
   - Every case cited in the memo (PDF or link)
   - The contract or statute being analyzed
   - Any key correspondence that shaped the analysis

2. **Create the bundle**:
   ```
   my-first-legal-tez/
     tez.md              # Your memo (convert to Markdown or keep as PDF)
     context/
       cited-case-1.pdf
       cited-case-2.pdf
       relevant-contract.pdf
       client-email-chain.pdf
   ```

3. **Add a minimal manifest**:
   ```json
   {
     "tezit_version": "1.2",
     "id": "noncompete-enforceability-research-2026-02",
     "title": "California Non-Compete Enforceability Analysis",
     "created_at": "2026-02-05T10:00:00Z",
     "synthesis": {
       "file": "tez.md",
       "type": "legal_memo"
     },
     "profile": "knowledge"
   }
   ```

4. **Upload to Tezit.com** or share the folder directly. Even without the platform, a shared folder with this structure is already a Tez -- it's context bundled with synthesis.

### Step 2: Adding Citation Conventions

Use the Tezit citation syntax in your synthesis document:

```markdown
The court in *Edwards* held that Section 16600 represents a
"strong public policy" against non-competes [[context/edwards-v-arthur-andersen.pdf:p944]].
```

The double-bracket syntax `[[context/filename.pdf:location]]` enables:
- Click-through to the cited source
- AI verification of the citation's accuracy
- Automated citation checking across the entire document

### Step 3: Organizing Context

For legal tezits, organize context by category:

```
context/
  cases/                    # Cited case law
  statutes/                 # Relevant statutory provisions
  contracts/                # Agreements being analyzed
  correspondence/           # Relevant emails, letters
  filings/                  # Court filings, regulatory submissions
  expert-reports/           # Expert opinions and analyses
  internal/                 # Work product, research notes
```

### Best Practices

- **Include the full case, not just the relevant excerpt.** Interrogation is more powerful when the AI can see the complete opinion.
- **Add unreferenced but relevant materials.** If you read a case and decided it was distinguishable, include it anyway. The Tez should capture what you considered, not just what you cited.
- **Version your tezits.** As a matter evolves, create new versions rather than overwriting. The Tez lineage system tracks the evolution of your analysis.
- **Use params.json for key assumptions.** If your analysis depends on the client being a Delaware corporation or the contract being governed by New York law, make those parameters explicit and adjustable.

### Privacy and Privilege Considerations

- **Client-identifying information**: Use the Tez permissions system to restrict who can interrogate and fork. Set `"reshare": false` for privilege-sensitive materials.
- **Internal work product**: Mark tezits as `"visibility": "internal"` for attorney work product that should not be shared outside the firm.
- **Redaction**: The Tez format supports context items with redacted versions for different audiences. Include full versions for internal use and redacted versions for sharing.

---

## Compliance Considerations

### Attorney-Client Privilege Preservation

**The Tez format strengthens privilege, not weakens it.**

Traditional concern: If we bundle source materials with analysis, are we increasing the risk of inadvertent disclosure?

The Tez approach actually reduces this risk:

1. **Explicit permissions**: Every Tez has a permissions object that specifies who can interrogate, fork, and reshare. This is more granular than email forwarding or shared drive access.

   ```json
   {
     "permissions": {
       "interrogate": ["client-team", "partner-group"],
       "fork": ["partner-group"],
       "reshare": false,
       "privilege_designation": "attorney_work_product",
       "privilege_log_entry": true
     }
   }
   ```

2. **Audit trails**: Every interrogation is logged. If a privileged Tez is inadvertently shared, the audit trail shows exactly who accessed it, what questions they asked, and what information was disclosed -- critical for clawback claims under FRE 502(b).

3. **Context compartmentalization**: Unlike a shared drive where users can browse freely, a Tez's interrogation model means recipients interact through the AI interface. The AI can be instructed to withhold privileged analysis even when answering from the same context bundle.

### Document Retention Requirements

Tezits are subject to the same retention policies as other work product:

- **Matter-level retention**: Tezits associated with a matter inherit that matter's retention schedule
- **Litigation hold**: When a hold is issued, all tezits referencing relevant context are preserved, including conversation records and fork history
- **Destruction**: When retention expires, the Tez and all its context (including cached interrogation responses) must be destroyed per firm policy

**Key advantage**: Because a Tez bundles everything together, it's easier to apply retention policies consistently. No more orphaned research that's retained after the memo is destroyed, or vice versa.

### eDiscovery Implications

Tezits are discoverable work product (subject to privilege). The format actually simplifies eDiscovery:

- **Complete production**: A Tez can be produced as a unit, ensuring that context accompanies analysis
- **Privilege review**: The structured format makes privilege review more efficient -- the manifest identifies all context items, and the conversation record shows the reasoning process
- **Search**: Tezits are semantically searchable. Instead of keyword-based eDiscovery that misses conceptual relevance, custodians can interrogate their tez vault: "Did we produce any analysis related to the force majeure dispute with Sterling?"
- **Metadata preservation**: The manifest preserves creation dates, author information, and lineage -- all commonly requested in discovery

### Ethical Obligations Around AI-Assisted Work Product

The legal profession is rapidly developing ethical guidelines for AI use. Tezits support compliance:

1. **Transparency of AI involvement**: The `conversation.json` record explicitly documents what AI assistance was used, what prompts were given, and what responses were generated. This satisfies disclosure obligations in jurisdictions that require lawyers to identify AI-assisted work product.

2. **Citation verification**: The interrogation feature allows supervising attorneys to verify that AI-generated citations are accurate -- addressing the widely publicized problem of AI "hallucinating" case citations.

3. **Human oversight documentation**: The conversation record shows the human lawyer's questions, corrections, and editorial decisions, demonstrating the required human oversight of AI-generated content.

4. **Competence and diligence**: By bundling sources with analysis, tezits make it easier for supervising attorneys to fulfill their duty of supervision under Model Rule 5.1. A partner can interrogate an associate's Tez to verify the quality of research without re-doing it from scratch.

### Jurisdiction-Specific Notes

| Jurisdiction | Key Consideration |
|---|---|
| **Federal Courts** | Standing orders in some districts now require disclosure of AI-assisted research. The Tez conversation record satisfies this. |
| **California** | State Bar Formal Opinion 2024-01 requires lawyers to understand AI tools they use. Tez's transparency supports this. |
| **New York** | NYSCEF e-filing accepts bundled submissions. Tezits can be formatted for court filing systems. |
| **EU** | AI Act requirements for transparency in professional AI use are inherently satisfied by the Tez conversation record. |

---

## Why This Matters

The legal profession runs on trust in reasoning. Clients trust their lawyers' analysis. Courts trust cited authority. Opposing parties trust (but verify) each other's evidence.

Every one of these trust relationships is strained by the current model of transmitting conclusions without scaffolding. A Tez doesn't replace legal judgment -- it makes legal judgment verifiable, transmissible, and interrogable.

The associate who creates a Tez isn't just writing a memo. They're building a knowledge asset that the firm can query, the client can interrogate, the court can verify, and the next lawyer on the matter can build on.

That's what "GitHub for knowledge work" means for law: version-controlled, forkable, interrogable reasoning that compounds over time instead of decaying in a document management system.

---

*This guide is part of the Tezit Protocol v1.2 industry series. For the full protocol specification, visit [tezit.com/spec](https://tezit.com/spec).*
*For questions, contact [legal@tezit.com](mailto:legal@tezit.com).*
