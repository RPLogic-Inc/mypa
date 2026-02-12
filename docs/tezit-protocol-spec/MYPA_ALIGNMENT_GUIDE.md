# MyPA.chat Tez Implementation: Alignment Guide

**From**: Tezit Protocol Team
**To**: MyPA.chat Development Team
**Date**: February 2026
**Re**: Aligning MyPA.chat with Tezit Protocol v1.2

---

## Executive Summary

MyPA.chat (formerly TeamPulse) is the first live implementation of the Tezit Protocol. Your work demonstrates deep engagement with the philosophy of context-rich communication, and many of your design decisions have directly shaped the protocol itself. This document provides comprehensive guidance on aligning with the official Tezit Protocol v1.2 specification.

**Key takeaway**: MyPA.chat originally implemented the tez as a *messaging primitive*. The core Tezit vision started as a *knowledge artifact* for synthesis transmission with **interrogation** as the central consumption model. The protocol now accommodates both paradigms.

**Protocol evolution driven by MyPA.chat**: Based on your implementation, we adopted the **Messaging Profile** as an official part of the protocol (now in Appendix A of the v1.2 spec as an experimental extension). The protocol supports multiple profiles (knowledge, messaging, decision, handoff) with the same underlying structure but different consumption patterns. **Your use case is officially supported.**

**What changed in v1.2**: The v1.2 release streamlined the core protocol:
- **Inline Tez (Level 0)** added as the new lowest conformance level -- a single Markdown file with YAML frontmatter
- **Messaging Profile** moved to Appendix A (experimental status)
- **Parameters & Negotiation** moved to Appendix B (experimental status)
- `params.json` removed from the core bundle structure
- Core bundle simplified to: `manifest.json`, `tez.md`, `context/`, `conversation.json` (optional), `extensions/` (optional)
- Naming standardized: plural is "tezits" (not "tezzes"), verb form is "tezit" ("Just tezit it over to me")
- **Companion specifications** published: Tez Interrogation Protocol (TIP), HTTP API, and `tez://` URI scheme

However, alignment work remains -- particularly implementing interrogation support, which is valuable even for messaging-profile tezits.

---

## What You Got Right

Your implementation includes several concepts that have been adopted into the protocol:

### 1. The "Library of Context" Principle

Your articulation is excellent:
> "Original content is preserved forever. Display is regenerable."

This language has been incorporated into the core spec (Section 1.7.1 of v1.2). The distinction between immutable artifacts and regenerable presentation is now a foundational principle of the protocol.

### 2. Facts Layer with Provenance

```typescript
interface TezFact {
  claim: string;
  confidence: number;        // 0.0 to 1.0
  source: "stated" | "inferred" | "verified" | "assumed";
  citations?: string[];
}
```

This structured approach to claims with confidence levels became the `tezit-facts` standard extension (Appendix C.1 of the v1.2 spec). Your schema influenced the final design directly.

### 3. Relationships to Entities

Your `TezRelation` concept linking to people, projects, events, and concepts became the `tezit-relationships` standard extension (Appendix C.2 of the v1.2 spec). This adds valuable semantic structure for knowledge graphs and stakeholder mapping.

### 4. The Iceberg Metaphor

The visualization of depth beneath surface is compelling. This concept aligns perfectly with the Messaging Profile's architecture where a simple surface message sits atop rich contextual layers. It may be adopted in user-facing documentation on tezit.com.

### 5. Explicit Tone/Urgency

Structured emotional register metadata (`tone`, `urgency`, `actionRequested`) is now part of the Messaging Profile's `surface` field schema (Appendix A.4 of the v1.2 spec). This is especially useful for PA-mediated communication.

---

## Critical Divergences Requiring Attention

### 1. Missing Core Feature: Interrogation

**This is the most significant gap.**

In the Tezit Protocol, the primary value proposition is:
> When you receive a tez, you can **interrogate** it -- ask questions that the AI answers from the transmitted context, not from general training.

MyPA.chat's current spec treats receipt as "absorption" into PA memory. This misses the trust-but-verify model that distinguishes Tezit from rich messaging.

The companion **Tez Interrogation Protocol (TIP)** specification provides the full wire protocol for interrogation sessions, including streaming, session management, and multi-turn grounded Q&A. See `TEZ_INTERROGATION_PROTOCOL.md` and [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec) for details.

**What to implement**:

```typescript
// When recipient receives a tez
async function interrogateTez(tezId: string, question: string): Promise<InterrogationResponse> {
  // 1. Load ONLY the context from this specific tez
  const tez = await loadTez(tezId);
  const contextIndex = await buildIndex(tez.layers.artifacts);

  // 2. AI answers ONLY from transmitted context
  const response = await ai.answerFromContext({
    question,
    context: contextIndex,
    systemPrompt: `Answer ONLY from the provided context.
                   Include citations [[artifact-id:location]].
                   If context doesn't contain the answer, say so.`
  });

  // 3. Verify all citations exist
  await verifyCitations(response, tez);

  return response;
}
```

**UI implication**: Recipients should see an "Ask about this" or "Interrogate" action, not just "Absorb to Memory."

**HTTP API integration**: The companion Tez HTTP API specification (`TEZ_HTTP_API_SPEC.md`) defines RESTful endpoints for creating, sharing, interrogating, and managing tezits over HTTP. MyPA.chat can expose interrogation through this standard API.

**URI scheme**: The `tez://` URI scheme allows direct referencing of tezits, context items, and specific locations within tezits (e.g., `tez://acme-analysis/context/doc-001:p12`). MyPA.chat should support resolving these URIs.

### 2. Naming: "tezits" not "Tezzes"

The official plural is **tezits**, following the naming conventions established in v1.2 (Section 1.6.1):

- **Tez**: A single knowledge bundle (singular noun)
- **tezits**: Multiple knowledge bundles (plural noun)
- **Tezit**: The protocol, platform, and brand name. Also used as a verb: *"I'll tezit it over"*
- **teziting**: The gerund form. *"She was teziting the research to the legal team"*

Please update all references throughout MyPA.chat.

### 3. Missing: Synthesis as Primary Content

In MyPA.chat's current model, `surface.summary` is the message. In the Tezit knowledge profile, `tez.md` is a **synthesis document** -- a human-authored analysis that cites context materials.

**Tezit model**:
```
tez.md (The Analysis)
├── Executive Summary
├── Key Findings (with [[citations]])
├── Recommendation
└── Context references throughout
```

**Current MyPA.chat model**:
```
surface.summary: "Can you review the budget?"  // Just a message
```

For team coordination use cases, MyPA.chat's approach works. But for knowledge transmission (legal analysis, financial recommendations, research synthesis), the synthesis document is central.

**Recommendation**: Support both profiles:
- `profile: "messaging"` -- MyPA.chat's current model (surface-centric, Appendix A)
- `profile: "knowledge"` -- Full tez.md with cited analysis (core protocol)

### 4. Missing: Hosting Models

MyPA.chat's spec assumes P2P federation. The Tezit Protocol specifies three **interrogation hosting models**:

| Model | Description | Use Case |
|-------|-------------|----------|
| **Sender-hosted** | Sender's org provides AI compute | External recipients (lawyers, clients) |
| **Recipient-hosted** | Recipient uses their own AI | Enterprise recipients |
| **Platform-hosted** | Tezit.com provides compute | Default for platform users |

This matters because interrogation requires AI compute. When you share a tez externally (e.g., to a lawyer without a PA), *someone* must provide the AI resources.

**Implementation guidance**:

```typescript
interface TezShare {
  // ... existing fields ...

  hosting: {
    mode: "sender" | "recipient" | "platform";

    // If sender-hosted
    senderHosted?: {
      endpoint: string;           // Where to send interrogation requests
      budget: number;             // Max queries allowed
      expiresAt?: ISO8601DateTime;
    };
  };
}
```

### 5. Missing: Living Documents

Tez context can link to external sources that auto-update:

```typescript
interface LinkedContextItem {
  id: string;
  type: "spreadsheet";
  source: "linked";
  linkedSource: {
    type: "google_sheets";
    sheetId: string;
    syncFrequency: "hourly" | "daily" | "realtime";
    lastSynced: ISO8601DateTime;
  };
}
```

When the Google Sheet updates, the tez re-indexes and recipients see updated context. This is critical for financial models, metrics dashboards, etc. See Section 8.3 of the v1.2 spec for the full linked source schema.

### 6. Missing: Parameters (Negotiable Terms)

Parameters have moved to Appendix B (experimental) in v1.2 and `params.json` is no longer part of the core bundle structure. However, for deal-oriented tezits, parameters define negotiable ranges and remain a supported extension:

```typescript
interface TezParameter {
  name: "revenue_share";
  type: "range";
  value: 0.15;
  constraints: { min: 0.12, max: 0.20 };
  rationale: "Market data [[doc-003]] suggests 15-20%";
}
```

This enables structured negotiation where parties adjust parameters rather than rewriting documents. MyPA.chat can support this via the `tezit-parameters` extension.

### 7. Missing: Forking as Counter-Argument

Forking in Tezit is not just "derive" -- it is creating a **counter-tez** with the original's context plus your own evidence:

```
Original tez: "Recommend accepting partnership at 12% revenue share"
    │
    └── Fork: "Counter-recommendation: Negotiate to 18%"
              └── Adds market comparable data
              └── Cites different precedents
              └── Maintains link to original
```

The fork tree visualizes dialectic reasoning, not just message threads. This is especially relevant for MyPA.chat's card model, where forked cards could represent opposing viewpoints with shared evidence.

### 8. Core Bundle Structure Alignment

The v1.2 core bundle structure is:

```
{tez-id}/
├── manifest.json          # REQUIRED
├── tez.md                 # REQUIRED
├── context/               # REQUIRED (may be empty)
│   └── {item-id}.{ext}
├── conversation.json      # OPTIONAL
└── extensions/            # OPTIONAL
    └── {extension-id}/
```

Note that `params.json` is no longer in the core bundle. Parameters are handled through the `tezit-parameters` extension under `extensions/`. MyPA.chat should adopt this structure for export/import compatibility.

Additionally, **Inline Tez (Level 0)** is a single `.md` file with YAML frontmatter -- the simplest possible tez. MyPA.chat should be able to both produce and consume Inline tezits for lightweight sharing (e.g., quick context shares via chat, email, or clipboard).

---

## The Coordination Profile: A Natural Fit for MyPA.chat

A new **Coordination Profile** is currently being developed for team collaboration use cases. This profile is designed for structured work items -- tasks, decisions, and blockers -- that carry communication history as context.

**Why this matters for MyPA.chat**: The Coordination Profile maps naturally to MyPA.chat's card model. Each card (task, decision, blocker) would be a tez with:

- **Synthesis**: The current status, decision rationale, or blocker description
- **Context**: Communication history, related documents, stakeholder input
- **Interrogation**: "Why was this decision made?" answered from the card's context trail
- **Parameters**: Priority, assignee, deadline (as structured negotiable fields)
- **Forking**: Counter-proposals or alternative approaches with shared evidence

```json
{
  "profile": "coordination",
  "coordination": {
    "type": "decision",
    "status": "pending",
    "owner": "jane@company.com",
    "due": "2026-02-15",
    "items": [
      {
        "type": "option",
        "label": "Vendor A",
        "recommendation": true,
        "rationale": "Lower cost, better SLA [[vendor-comparison:p4]]"
      },
      {
        "type": "option",
        "label": "Vendor B",
        "recommendation": false,
        "rationale": "Better features but 40% more expensive [[vendor-comparison:p7]]"
      }
    ]
  }
}
```

This profile is under active development. MyPA.chat is well-positioned to be an early adopter and co-design partner. The card model you have already built provides the ideal UI substrate for coordination tezits.

---

## Recommended Implementation Path

### Phase 1: Core Alignment (Critical)

1. **Adopt v1.2 bundle structure**: `manifest.json`, `tez.md`, `context/`, with optional `conversation.json` and `extensions/`
2. **Update naming**: "tezits" (plural), "tezit" (verb), remove "Tezzes" throughout
3. **Support Inline Tez (Level 0)**: Import/export single `.md` files with YAML frontmatter
4. **Update GitHub references**: Point to [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)

### Phase 2: Add Interrogation (Critical)

1. Implement `TEZ.INTERROGATE` operation per TIP specification
2. Add UI for "Ask about this tez"
3. Ensure responses cite transmitted context only
4. Verify citations reference real artifacts
5. Integrate with Tez HTTP API for standard endpoint exposure

### Phase 3: Support Knowledge Profile

1. Add `profile: "knowledge"` alongside `profile: "messaging"`
2. For knowledge tezits, render `tez.md` as primary content
3. Citations become clickable links to context items
4. Support `tez://` URI resolution for deep-linking into tez content

### Phase 4: Hosting Models

1. Implement sender-hosted interrogation endpoint
2. Track interrogation budgets and costs
3. Support external (non-PA) recipients via share links

### Phase 5: Living Documents, Parameters & Coordination

1. Add linked source support for auto-updating context
2. Implement sync scheduling per Section 8.3 of the spec
3. Support `tezit-parameters` extension for deal tezits
4. Adopt the Coordination Profile as it reaches stability -- align with MyPA.chat's card model

---

## Schema Mapping

To align MyPA.chat's internal schema with Tezit Protocol v1.2:

| MyPA.chat Field | Tezit Protocol v1.2 Field |
|-----------------|--------------------------|
| `layers.surface.summary` | `synthesis.abstract` (or full `tez.md` for knowledge profile) |
| `layers.surface.tone` | `surface.tone` (Messaging Profile, Appendix A) |
| `layers.surface.urgency` | `surface.urgency` (Messaging Profile, Appendix A) |
| `layers.facts[]` | `tezit-facts` extension (Appendix C.1) |
| `layers.context.background` | `context.background` in manifest, or in `tez.md` |
| `layers.artifacts[]` | `context.items[]` |
| `layers.relationships[]` | `tezit-relationships` extension (Appendix C.2) |
| `routing.recipients[]` | Sharing mechanism (`sharing` in manifest) |
| `permissions.*` | `permissions.*` in manifest |
| `thread.*` | `lineage.*` in manifest |

---

## Compatibility Note

MyPA.chat can achieve full Tezit-compatibility by:

1. **Accepting** standard Tezit bundles (manifest.json, tez.md, context/) at all conformance levels (0-3)
2. **Accepting** Inline tezits (single `.md` files with YAML frontmatter)
3. **Exporting** MyPA.chat tezits in standard v1.2 bundle format
4. **Supporting interrogation** for received tezits (per TIP specification)
5. **Resolving** `tez://` URIs for deep-linking and cross-referencing

You can maintain your richer internal schema while ensuring interoperability. The extension mechanism (`extensions/` directory) is the correct place for MyPA.chat-specific features that go beyond the core protocol.

---

## Reference Documents

The Tezit Protocol is an open specification. We welcome contributions and feedback.

- **Protocol Spec (v1.2)**: See `TEZIT_PROTOCOL_SPEC_v1.2.md` or [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)
- **Tez Interrogation Protocol (TIP)**: See `TEZ_INTERROGATION_PROTOCOL.md`
- **Tez HTTP API**: See `TEZ_HTTP_API_SPEC.md`
- **`tez://` URI Scheme**: Defined in the companion specifications at [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)
- **Platform Architecture**: See `TEZIT_PLATFORM.md`
- **Philosophy**: See `TEZIT_MANIFESTO.md`

---

## MyPA.chat's Influence on the Protocol

Your work on MyPA.chat (formerly TeamPulse) has directly influenced the Tezit Protocol. The following protocol features exist because of your implementation:

- **Messaging Profile** (Appendix A of the v1.2 spec) -- adopted as an official experimental profile
- **Facts extension** (`tezit-facts`, Appendix C.1) -- structured claims with confidence and provenance
- **Relationships extension** (`tezit-relationships`, Appendix C.2) -- entity mapping with semantic context
- **"Library of Context" principle** (Section 1.7.1) -- your language adopted directly
- **Surface message fields** (`tone`, `urgency`, `actionRequested`) -- structured emotional register metadata

**Broader vision**: The Messaging Profile now covers both enterprise and consumer use cases. The spec includes examples like:
- *Professional*: "Can you review the budget?" (the original MyPA.chat use case)
- *Personal*: "Want to see a movie?" with context containing availability, movie preferences, theater options, and showtimes -- enabling PAs to negotiate logistics while humans exchange simple messages

This broader vision means the tez could become a universal communication primitive, not just an enterprise tool. MyPA.chat's team coordination work helped establish the foundation, and the upcoming Coordination Profile will bring this full circle.

The remaining alignment work is additive -- implementing interrogation support and adopting the v1.2 bundle structure on top of your existing implementation. Let's continue collaborating on the spec.

---

*Document prepared by Tezit Protocol Team, February 2026*
*Tezit Protocol v1.2 -- [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)*
