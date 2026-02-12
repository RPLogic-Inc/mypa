# MyPA Tezit Protocol Alignment

**Version:** 1.0
**Date:** February 2026
**Status:** Implementation Roadmap
**Protocol Version Target:** Tezit Protocol v1.1

---

## Executive Summary

This document outlines how MyPA will align with the official Tezit Protocol v1.1 specification, based on feedback from the Tezit Protocol Team. Our implementation has influenced the protocol (the **Messaging Profile** now exists because of MyPA), and the protocol team has adopted several of our concepts:

**MyPA contributions adopted into Tezit Protocol:**
- The "Library of Context" principle and language
- Facts layer with provenance (`tezit-facts` extension)
- Relationships extension (`tezit-relationships`)
- Surface message fields (tone, urgency, actionRequested)
- Messaging Profile as first-class citizen (Section 1.7.2)

**Alignment work required:**
- Implement interrogation (critical gap)
- Support synthesis document type
- Add hosting models for interrogation
- Implement living documents and parameters
- Add proper forking as counter-argument

---

## Part 1: Terminology Alignment

### Pluralization: "Tezzes" not "Tezim"

The official plural is **Tezzes**, following English pluralization conventions.

**Files requiring update:**
- `docs/TEZ_COMPLETE_SPECIFICATION.md`
- `docs/OPENCLAW_INTEGRATION_STRATEGY.md`
- Any future implementation code

**Note:** Our original use of "Tezim" (Hebrew pluralization) was a creative choice, but standardizing on "Tezzes" ensures protocol compatibility and broader adoption.

---

## Part 2: Critical Gap - Interrogation

### The Core Value Proposition

The Tezit Protocol's primary value proposition is:

> When you receive a Tez, you can **interrogate** it—ask questions that the AI answers from the transmitted context, not from general training.

Our current implementation treats receipt as "absorption" into PA memory. This misses the **trust-but-verify** model that distinguishes Tezit from rich messaging.

### What Interrogation Enables

| Without Interrogation | With Interrogation |
|-----------------------|-------------------|
| "I trust this context" | "Let me verify this claim" |
| Context absorbed silently | Context can be questioned |
| No auditability | Every answer cites sources |
| Sender controls narrative | Recipient can explore independently |

### Implementation Design

```typescript
// NEW: backend/src/services/tezInterrogation.ts

export interface InterrogationRequest {
  tezId: string;
  question: string;
  userId: string;
}

export interface InterrogationResponse {
  answer: string;
  citations: TezCitation[];
  confidence: number;
  answeredFrom: "context" | "insufficient_context";
}

export interface TezCitation {
  artifactId: string;
  location?: string;       // Page, timestamp, paragraph
  excerpt: string;         // The cited text
  relevance: number;       // 0.0 to 1.0
}

export async function interrogateTez(
  request: InterrogationRequest
): Promise<InterrogationResponse> {
  // 1. Load ONLY the context from this specific Tez
  const tez = await loadTez(request.tezId);

  // 2. Build searchable index from transmitted artifacts
  const contextIndex = await buildContextIndex(tez.layers.artifacts);

  // 3. AI answers ONLY from transmitted context
  const response = await ai.answerFromContext({
    question: request.question,
    context: contextIndex,
    systemPrompt: `You are answering questions about a Tez (context bundle).
                   Answer ONLY from the provided context materials.
                   Include citations in format [[artifact-id:location]].
                   If the context doesn't contain the answer, say:
                   "This information is not contained in the transmitted context."
                   Never use your general training knowledge.`
  });

  // 4. Verify all citations exist in the Tez
  const verifiedCitations = await verifyCitations(response, tez);

  // 5. Track interrogation for audit
  await logInterrogation(request, response);

  return {
    answer: response.answer,
    citations: verifiedCitations,
    confidence: response.confidence,
    answeredFrom: verifiedCitations.length > 0 ? "context" : "insufficient_context"
  };
}
```

### API Endpoint

```typescript
// NEW: POST /api/tez/:id/interrogate

router.post("/:id/interrogate", authMiddleware, async (req, res) => {
  const { question } = req.body;
  const tezId = req.params.id;
  const userId = req.user.id;

  // Verify user has access to this Tez
  const tez = await getTez(tezId);
  if (!canAccess(userId, tez)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const response = await interrogateTez({ tezId, question, userId });

  return res.json({ data: response });
});
```

### UI Changes

**Current:** "Absorb to Memory" button
**New:** "Interrogate" / "Ask about this" action

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 From: Sarah Chen                               2:30 PM

"Can you review the Q4 budget proposal?"

        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
        ↓ 3 layers of context available
        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄

[Reply]    [Explore Context]    [Interrogate]    [Absorb]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Interrogation UI:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERROGATE TEZ from Sarah Chen

Ask a question about this Tez's context:
┌─────────────────────────────────────────────────────────┐
│ What's the specific deadline mentioned?                 │
└─────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANSWER (from transmitted context):

The deadline is Friday EOD (end of day).

CITATIONS:
📄 Voice memo [0:12-0:18]: "...deadline is Friday EOD..."
📄 Surface message: "...flag any concerns about infrastructure costs"

[Ask Another Question]                              [Done]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Part 3: Tez Types - Message vs Synthesis

### Current Model (Message-Centric)

```typescript
layers.surface.summary = "Can you review the budget?";  // Just a message
```

### Tezit Model (Synthesis-Centric)

For knowledge transmission (legal analysis, research, recommendations), the Tez contains a **synthesis document** (`tez.md`) that cites context materials:

```markdown
# Q4 Budget Analysis

## Executive Summary
Based on analysis of the attached financial data [[budget-q4.xlsx]],
infrastructure costs have increased 23% quarter-over-quarter.

## Key Findings
1. Cloud spend exceeds projections by $120k [[budget-q4.xlsx:row-45]]
2. Reserved instance utilization is only 62% [[aws-report.pdf:page-3]]
3. The August planning meeting set a 20% reduction target [[meeting-notes.md]]

## Recommendation
Prioritize reserved instance optimization before considering headcount changes.

## Context References
- [[budget-q4.xlsx]] - Q4 Budget Proposal v2
- [[aws-report.pdf]] - AWS Cost Explorer Report
- [[meeting-notes.md]] - August Planning Meeting Notes
```

### Supporting Both Types

```typescript
interface Tez {
  // ... existing fields ...

  type: "message" | "synthesis";

  // For message type (our current model)
  layers: {
    surface: {
      summary: string;              // The message itself
      tone?: TezTone;
      urgency?: TezUrgency;
      actionRequested?: string;
    };
    // ... facts, context, artifacts
  };

  // For synthesis type (new)
  synthesis?: {
    document: string;               // The tez.md content (markdown with citations)
    abstract: string;               // Executive summary
    citations: SynthesisCitation[]; // Parsed citation references
  };
}

interface SynthesisCitation {
  reference: string;                // [[artifact-id:location]]
  artifactId: string;
  location?: string;
  inlineText: string;               // The text being cited
}
```

### UI for Synthesis Tezzes

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SYNTHESIS from Sarah Chen                      2:30 PM

Q4 Budget Analysis

Based on analysis of the attached financial data,
infrastructure costs have increased 23% quarter-over-quarter.

Key Findings:
• Cloud spend exceeds projections by $120k [1]
• Reserved instance utilization is only 62% [2]
• August planning meeting set 20% reduction target [3]

[1] budget-q4.xlsx:row-45  [2] aws-report.pdf:p3  [3] meeting-notes.md

[View Full Analysis]  [Interrogate]  [View Sources]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Part 4: Hosting Models

### Why Hosting Matters

Interrogation requires AI compute. When sharing a Tez externally (to someone without a PA, like a lawyer or client), *someone* must provide those resources.

### Three Models

| Model | Description | Use Case |
|-------|-------------|----------|
| **Sender-hosted** | Sender's org provides AI | External recipients without PAs |
| **Recipient-hosted** | Recipient's PA handles | Enterprise recipients with PAs |
| **Platform-hosted** | tezit.com provides | Default for platform users |

### Schema Addition

```typescript
interface TezShare {
  // ... existing fields ...

  hosting: {
    mode: "sender" | "recipient" | "platform";

    // If sender-hosted
    senderHosted?: {
      endpoint: string;           // Where to send interrogation requests
      budget: {
        maxQueries: number;       // Max interrogation queries allowed
        remainingQueries: number; // Current remaining
        expiresAt?: ISO8601DateTime;
      };
      authToken?: string;         // Token for accessing endpoint
    };

    // If platform-hosted
    platformHosted?: {
      tezitEndpoint: string;      // https://api.tezit.com/interrogate
      tezitTezId: string;         // Platform's reference ID
    };
  };
}
```

### Implementation Phases

**Phase 1: Recipient-hosted (default)**
- MyPA users interrogate using their own PA
- No additional infrastructure needed

**Phase 2: Sender-hosted**
- Expose `/api/tez/:id/interrogate` endpoint
- Track query budgets per shared Tez
- Allow external access with signed URLs

**Phase 3: Platform-hosted** (optional)
- Integration with tezit.com platform
- Fallback for users without infrastructure

---

## Part 5: Living Documents

### Concept

Tez context can link to external sources that auto-update:

```typescript
interface LinkedContextItem {
  id: string;
  type: "spreadsheet" | "document" | "dashboard";
  source: "linked";                    // vs "static"

  linkedSource: {
    type: "google_sheets" | "notion" | "airtable" | "custom_webhook";

    // Connection details
    connectionId: string;              // Reference to stored OAuth connection
    resourceId: string;                // Sheet ID, doc ID, etc.

    // Sync configuration
    syncFrequency: "realtime" | "hourly" | "daily" | "manual";
    lastSynced: ISO8601DateTime;

    // Versioning
    currentVersion: string;            // Hash or version ID
    versionHistory: {
      version: string;
      syncedAt: ISO8601DateTime;
      summary?: string;                // AI-generated diff summary
    }[];
  };

  // Cached content (for offline/fallback)
  cachedContent: string;
  cachedAt: ISO8601DateTime;
}
```

### Use Cases

1. **Financial Models**: Google Sheet with projections updates → Tez re-indexes
2. **Metrics Dashboards**: Live data feeds into Tez context
3. **Collaborative Docs**: Notion/Google Docs that evolve over time

### Recipient Experience

When linked content updates:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 From: Sarah Chen                               2:30 PM

"Review the Q4 budget proposal"

⟳ CONTEXT UPDATED 2 hours ago
  └─ budget-q4.xlsx: Row 45 changed ($890k → $920k)

[View Changes]  [Interrogate with Latest]  [Use Original]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Part 6: Parameters (Negotiable Terms)

### Concept

For deal-oriented Tezzes, parameters define negotiable ranges:

```typescript
interface TezParameter {
  name: string;                        // "revenue_share"
  displayName: string;                 // "Revenue Share Percentage"
  type: "range" | "enum" | "boolean";

  // Current proposed value
  value: number | string | boolean;

  // For range type
  constraints?: {
    min: number;
    max: number;
    step?: number;
  };

  // For enum type
  options?: string[];

  // Why this value
  rationale: string;                   // "Market data [[doc-003]] suggests 15-20%"
  rationaleCitations?: string[];       // Links to supporting artifacts

  // Negotiation history
  history?: {
    proposedBy: string;
    value: number | string | boolean;
    rationale: string;
    timestamp: ISO8601DateTime;
  }[];
}
```

### UI for Parameter Negotiation

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DEAL TEZ: Partnership Proposal

Parameters:

Revenue Share      [====●=====]  15%
                   12%        20%
                   Rationale: Market comparables suggest 15-20%

Contract Term      ○ 1 year  ● 2 years  ○ 3 years
                   Rationale: Matches typical enterprise cycles

Exclusivity        ☐ (not selected)
                   Rationale: Non-exclusive allows flexibility

[Accept Parameters]  [Counter-propose]  [Interrogate Rationale]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Part 7: Forking as Counter-Argument

### Current Model

`canDerive: true` allows creating a follow-up Tez. But this doesn't capture the dialectic nature of counter-arguments.

### Tezit Model

A **fork** is a counter-Tez that:
1. Maintains explicit lineage to the original
2. Adds new context/evidence
3. Proposes an alternative conclusion
4. Can be visualized as a debate tree

```typescript
interface TezFork {
  id: string;
  type: "fork";

  lineage: {
    originalTezId: string;            // The Tez being countered
    forkType: "counter" | "amendment" | "extension";

    // What aspects are being challenged
    challenges?: {
      targetLayer: "facts" | "context" | "synthesis" | "parameters";
      targetIds?: string[];            // Specific fact IDs being challenged
      nature: "disputes" | "adds_context" | "proposes_alternative";
    }[];
  };

  // The counter-argument content
  layers: {
    surface: {
      summary: string;                 // "Counter: Negotiate to 18%"
    };
    facts: TezFact[];                  // New evidence
    // ... includes original context + new materials
  };

  // Link to original's artifacts (don't duplicate)
  inheritedArtifacts: string[];        // IDs from original Tez
  addedArtifacts: TezArtifact[];       // New supporting evidence
}
```

### Fork Tree Visualization

```
Original: "Accept partnership at 12% revenue share"
    │
    ├── Fork A: "Counter: Negotiate to 18%"
    │      └─ Adds: Market comparable data
    │      └─ Disputes: fact_3 (market rate assumption)
    │
    └── Fork B: "Amendment: Accept at 12% with shorter term"
           └─ Adds: Risk analysis for longer commitments
           └─ Proposes: Alternative parameter set
```

### UI for Fork Creation

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE COUNTER-TEZ

Responding to: "Accept partnership at 12% revenue share"

What type of response?
● Counter-proposal (different recommendation)
○ Amendment (modify specific terms)
○ Extension (add supporting context)

What are you challenging?

☑ Fact: "Market rate is 10-15%"
   Your counter: Market comparables show 15-20% for similar deals

☐ Parameter: Revenue share (12%)
☐ Recommendation: Accept partnership

Add supporting evidence:
📎 market_analysis_2026.pdf (attached)

[Preview Fork]                              [Create Counter-Tez]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Part 8: Implementation Roadmap

### Phase 7A: Core Interrogation (Critical Path)

**Backend:**
- [ ] Create `tezInterrogation.ts` service
- [ ] Add `POST /api/tez/:id/interrogate` endpoint
- [ ] Implement context-only AI answering
- [ ] Add citation verification
- [ ] Create interrogation audit log

**Frontend:**
- [ ] Add "Interrogate" button to Tez cards
- [ ] Create TezInterrogation component
- [ ] Display answers with clickable citations
- [ ] Track query history per Tez

**Database:**
- [ ] Add `tez_interrogations` table
- [ ] Add `tez_citations` table

### Phase 7B: Synthesis Documents

**Backend:**
- [ ] Extend Tez schema with `type` field
- [ ] Add synthesis document parsing (extract citations)
- [ ] Support tez.md rendering with citation links

**Frontend:**
- [ ] Create SynthesisTezView component
- [ ] Implement citation hover/click behavior
- [ ] Add "View Full Analysis" expansion

### Phase 7C: Hosting Models

**Backend:**
- [ ] Add hosting configuration to TezShare schema
- [ ] Implement query budget tracking
- [ ] Create external interrogation endpoint (signed URLs)
- [ ] Add hosting mode selection in share flow

**Frontend:**
- [ ] Show hosting mode in shared Tez UI
- [ ] Display remaining query budget
- [ ] Handle "budget exhausted" gracefully

### Phase 7D: Living Documents & Parameters

**Backend:**
- [ ] Add linked source schema
- [ ] Implement sync scheduling (Google Sheets first)
- [ ] Create version history tracking
- [ ] Add parameter schema to Tez

**Frontend:**
- [ ] Show "Context Updated" indicators
- [ ] Create parameter negotiation UI
- [ ] Implement diff viewer for linked source changes

### Phase 7E: Forking

**Backend:**
- [ ] Add fork lineage schema
- [ ] Implement fork creation with inheritance
- [ ] Track challenge relationships

**Frontend:**
- [ ] Create fork tree visualization
- [ ] Add "Create Counter-Tez" flow
- [ ] Show dialectic threading in UI

---

## Part 9: Schema Mapping (Current → Aligned)

| MyPA Current | Tezit Protocol v1.1 | Action |
|-------------------|---------------------|--------|
| `layers.surface.summary` | `synthesis.abstract` (synthesis) or `surface.summary` (message) | Support both |
| `layers.facts[]` | `tezit-facts` extension | Already aligned |
| `layers.context.background` | `context.background` | Already aligned |
| `layers.artifacts[]` | `context.items[]` | Rename internally |
| `layers.relationships[]` | `tezit-relationships` extension | Already aligned |
| `routing.recipients[]` | Sharing mechanism | Already aligned |
| `permissions.*` | `permissions.*` | Already aligned |
| `thread.*` | `lineage.*` | Rename, add fork support |
| (missing) | `TEZ.INTERROGATE` | **Implement** |
| (missing) | `hosting.*` | **Implement** |
| (missing) | `linkedSource.*` | **Implement** |
| (missing) | `parameters[]` | **Implement** |
| (missing) | `lineage.forkType` | **Implement** |

---

## Part 10: Compatibility Strategy

### Accepting Standard Tezit Bundles

MyPA will accept the standard Tezit bundle format:

```
tez-bundle/
├── manifest.json          # Tez metadata and permissions
├── tez.md                 # Synthesis document (if type=synthesis)
└── context/
    ├── item-001.pdf
    ├── item-002.xlsx
    └── ...
```

### Exporting MyPA Tezzes

When exporting, MyPA will generate standard format:

```typescript
async function exportTezAsBundle(tezId: string): Promise<TezBundle> {
  const tez = await loadTez(tezId);

  return {
    manifest: convertToManifest(tez),
    synthesis: tez.type === "synthesis" ? tez.synthesis.document : null,
    context: await gatherArtifacts(tez.layers.artifacts)
  };
}
```

### Maintaining Internal Richness

MyPA can maintain its richer internal schema while ensuring export/import compatibility:

- Internal: Full MyPA card metadata, team routing, ClickUp links
- Export: Standard Tezit bundle (plugin-specific data in `extensions` field)
- Import: Parse standard format, activate MyPA features if available

---

## Acknowledgments

This alignment work is the result of productive collaboration with the Tezit Protocol Team. Their recognition that the **Messaging Profile** emerged from MyPA's implementation validates our approach to voice-first team communication.

The remaining work is additive—we're building interrogation support on top of a solid foundation, not refactoring fundamentals.

---

*Document Version: 1.0*
*Last Updated: February 2026*
*Next Review: After Phase 7A completion*
