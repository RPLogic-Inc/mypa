# Feedback from MyPA (First Live Deployment) to Tezit Protocol Team

**Date**: February 5, 2026
**From**: MyPA Development Team (mypa.chat)
**Protocol Versions Reviewed**: v1.0, v1.1, v1.2, TIP v1.0
**Repository Reviewed**: github.com/ragurob/Tezit.com.git

---

## Executive Summary

MyPA is actively implementing the Tezit Protocol as its first live deployment. We've reviewed the complete specification suite (v1.2 + TIP v1.0 + HTTP API + URI Scheme) and are preparing to ship interrogation as our next major feature. This document contains our findings, questions, and recommendations as the first team building against this spec in production.

Overall: **the protocol is ambitious, well-thought-out, and genuinely novel**. The interrogation model is the killer feature. Below are the items we believe would accelerate adoption and reduce implementer friction.

---

## 1. Requests for Clarification

### 1.1 Which spec version is authoritative?

The MyPA Alignment Guide (`TEAMPULSE_ALIGNMENT_GUIDE.md`) references v1.1 terminology and features. However, v1.2 exists in the same repository and makes significant changes (Inline Tez, parameters moved to experimental, naming corrections).

**Question**: Should MyPA target v1.2? Is v1.1 deprecated? The alignment guide needs updating if v1.2 is canonical.

### 1.2 Plural form: "tezits" is definitive?

The v1.2 spec corrects the plural from "tezzes" to "tezits." The alignment guide still uses "Tezzes" in places. We'll use "tezits" going forward -- please confirm this is correct.

### 1.3 `tezit_version` vs `tezit` field name

Full bundle manifests use `tezit_version` as the version field. Inline Tez YAML frontmatter uses `tezit`. This inconsistency will cause confusion for implementers parsing both formats.

**Suggestion**: Standardize on one field name. We'd recommend `tezit` for brevity (matching the Inline Tez format), with `tezit_version` as a deprecated alias in manifests.

### 1.4 Context scope semantics

The difference between `full` ("all accessible materials were searched"), `focused` ("auto-expanded from entities/topics"), and `private` ("only explicitly provided items") needs more precise definition. In MyPA's case, a card's context includes voice recordings, transcriptions, AI analysis, and team member responses -- which scope applies?

**Suggestion**: Add concrete examples for each scope level, particularly for team collaboration use cases.

---

## 2. Missing Implementation Resources

### 2.1 JSON Schema Files (Critical)

The spec references schemas at `tezit.com/spec/v1.2/manifest.schema.json` but no machine-parseable JSON Schema files exist in the repository. We are currently implementing validation from prose descriptions, which is error-prone.

**Request**: Publish JSON Schema files for:
- `manifest.json` (all conformance levels)
- Inline Tez YAML frontmatter
- `conversation.json`
- Extension schemas (`tezit-facts`, `tezit-relationships`)
- TIP session/query/response objects

This would enable automated validation and eliminate ambiguity about required vs optional fields, types, and constraints.

### 2.2 Reference Test Bundle (Critical for TIP Compliance)

The TIP compliance test suite (Section 9) references a test bundle at `tezit.com/spec/tip/test-bundle` that doesn't exist. Without it, we cannot verify our interrogation implementation against the 7 required compliance tests.

**Offer**: We can help create this test bundle from our existing 365 integration tests and real-world card context data. We have voice recordings, transcriptions, AI analyses, and team message threads that would make excellent test fixtures.

### 2.3 Reference Implementation

No working code demonstrates the core value proposition (interrogation). The CLI handles bundle creation and validation but has no `tez interrogate` command.

**Offer**: MyPA's interrogation implementation could serve as the reference. We're happy to contribute our interrogation service code back to the protocol repository as a TypeScript reference implementation.

---

## 3. Proposed Protocol Enhancements

### 3.1 "Team" or "Coordination" Profile

MyPA's primary use case is team coordination with rich context -- actionable items (tasks, decisions, blockers) backed by voice recordings, transcriptions, and AI analysis. This doesn't fit neatly into either the "knowledge" profile (heavy synthesis documents) or the "messaging" profile (surface message + context).

**Proposal**: A "coordination" or "team" profile that:
- Surface is an actionable item (task, decision, question, blocker)
- Context includes the communication history that produced the item
- Interrogation focuses on "what was decided?" and "what's the background?"
- Status tracking (pending/acknowledged/completed) is first-class
- Multiple recipients with different roles (assignee, reviewer, informed)

This would capture the pattern we see in real team usage and could benefit other implementations targeting workplace collaboration.

### 3.2 "TIP Lite" for Team Messaging

The full TIP spec (114KB, 7 compliance tests, RAG pipeline, confidence signals, session protocol) is comprehensive and appropriate for knowledge-heavy use cases (consulting, legal, finance). For team messaging where context items are typically <32K tokens total (a few voice memos + transcriptions), the full RAG pipeline is unnecessary.

**Proposal**: Define a "TIP Lite" conformance level for small-context tezits (<32K tokens):
- Full prompt loading (no RAG needed)
- Simplified response classification (grounded / abstention only, without confidence levels)
- Reduced compliance test suite (grounding + abstention + hallucination resistance)
- No session protocol required (stateless query/response is sufficient)

This would lower the implementation bar significantly for messaging-oriented platforms while preserving the core value of context-only answering.

### 3.3 Streaming in TIP

The TIP spec mentions streaming as "a future extension point" (Section 10.1), but the HTTP API spec already defines SSE streaming via `?stream=true` on the interrogation query endpoint (Section 5.2). These should be connected.

**Suggestion**: Add a TIP section referencing the HTTP API streaming spec, or at minimum, acknowledge that streaming is already specified in the companion document.

### 3.4 Multi-Model Interrogation Guidance

When a recipient downloads a Tez and interrogates locally using a different model than the sender used for synthesis, results can differ significantly. The spec doesn't address quality expectations or consistency guarantees across models.

**Suggestion**: Add guidance on:
- Minimum model capability requirements for TIP compliance
- Whether sender can specify recommended models
- Expected variance in citation accuracy across model families
- How to handle model-specific citation format differences

---

## 4. Implementation Observations

### 4.1 Citation Accuracy in Practice

We expect citation generation reliability to be the primary quality challenge. Current LLMs are good but not perfect at generating accurate `[[item-id:location]]` citations. Our plan:

1. Post-process all responses to verify citations exist in the context
2. Check that cited locations contain content semantically related to the claim
3. Strip or flag citations that fail verification
4. Track pass/fail rates and report back

**Commitment**: We will share real-world citation accuracy metrics after our first 1,000 interrogation sessions.

### 4.2 Voice/Audio Context Quality

MyPA is voice-first -- many context items are audio recordings transcribed by Whisper. Interrogation quality will be bounded by transcription quality. The spec handles audio context (chunking strategies in TIP Section 5.2.1) but doesn't address the compounding quality issue: Whisper transcription errors become "ground truth" that the interrogation AI treats as fact.

**Observation**: For audio-heavy tezits, the "confidence signal" system becomes critical. We plan to add transcription confidence metadata to audio context items and surface this during interrogation.

### 4.3 Inline Tez as Entry Point

Level 0 (Inline Tez) is brilliant for adoption. We plan to implement import/export of Inline Tez format as our first Tez interoperability feature, before full bundle support. This lets users share context-rich messages that any Tez-compatible tool can interrogate.

**Observation**: The Inline Tez `context` field supports both URLs and local file paths. For import via paste/email, local file paths are unresolvable. We'll treat local paths as metadata-only (stored but not fetchable) and URL paths as fetchable on import.

### 4.4 MyPA Card-to-Tez Mapping

Our existing data model maps naturally to the protocol:

| MyPA | Tez Protocol |
|-----------|-------------|
| Card content/summary | `tez.md` synthesis |
| `card_context` entries (voice, text, AI) | `context/` items |
| Card routing metadata | Sharing mechanism |
| Card responses/reactions | Could become conversation.json |
| Card attachments | Additional context items |
| Priority/status | Could map to coordination profile metadata |

We can export any MyPA card as a valid Tez bundle today with moderate effort.

---

## 5. Questions for the Protocol Team

1. **Is the Ragu platform (2,963 tests, 27 packages) intended to be open-source?** If so, would MyPA benefit from using `ragu-documents` for context indexing or `ragu-semantic-cache` for interrogation caching?

2. **What is the timeline for tezit.com platform availability?** Would MyPA connect as a "source" platform (creating/sharing tezits) or operate independently?

3. **Is there interest in a MyPA OpenClaw Skill** that enables OpenClaw users to create, share, and interrogate tezits from their PA? This could be a powerful distribution channel for the protocol.

4. **How should we handle the `tezit-messaging` extension** since the Messaging Profile moved to experimental in v1.2? Should we implement it as-is, wait for stabilization, or help shape it based on our real-world messaging data?

5. **Would the protocol team like access to our production deployment** for testing and validation once interrogation is live?

---

## 6. What We're Building

### Immediate (This Sprint)
- `POST /api/tez/:id/interrogate` endpoint implementing TIP core
- Context-only AI answering with the normative system prompt template
- Citation verification pipeline
- "Interrogate" / "Ask about this" UI action on cards
- Interrogation audit logging

### Next Sprint
- Inline Tez import/export (Level 0 conformance)
- Synthesis document view with clickable citations
- `tezit-facts` extension for automatic fact extraction
- `tezit-relationships` extension for entity mapping

### Future
- Full bundle export (.tez archive)
- Fork-as-counter-argument with lineage tracking
- Sender-hosted interrogation endpoint for external recipients
- Query budget tracking

---

## 7. Acknowledgments

The Tezit Protocol represents genuinely original thinking about how AI changes communication. The insight that **recipients should be able to verify claims against the context that produced them** is powerful and, as far as we know, unique in the communication protocol space.

We're honored to be the first live deployment and committed to making the implementation excellent. The protocol team's openness to feedback (adopting our Library of Context principle, Facts extension, Relationships extension, and Messaging Profile into the spec) gives us confidence in this partnership.

We look forward to sharing our implementation data and continuing to shape the protocol from real-world usage.

---

*MyPA -- mypa.chat*
*"Original content is preserved forever. Display is regenerable."*

---

## v2 Feedback: Tezit Protocol v1.2.4 + Coordination Profile Implementation

**Date**: February 6, 2026
**Protocol Versions Implemented**: v1.2.4, TIP v1.0.3, Coordination Profile v1.0
**Features Shipped**: Discovery endpoint, status state machine, card dependencies, escalation tracking, SSE streaming interrogation, portable export, tez:// URI, forking (Counter-Tez)

### Feedback Item 1: `responded` status needed in Coordination Profile

The Coordination Profile defines statuses: pending, acknowledged, in_progress, blocked, completed, cancelled. In production, **31% of our cards** flow through `acknowledged -> responded -> in_progress`. The `responded` status represents "someone has replied but work hasn't started" -- a common and distinct state in team coordination.

**Recommendation**: Add `responded` to the Coordination Profile status enum, positioned between `acknowledged` and `in_progress`.

### Feedback Item 2: TIP Micro tier at 8K tokens

TIP Lite is formalized at 32K tokens. Our mobile-first app rarely exceeds 4K token contexts (a few voice memos + transcriptions). At this size, even the TIP Lite RAG preamble is unnecessary -- the entire context fits in a single prompt window with room to spare.

**Recommendation**: Define a TIP Micro tier (<8K tokens) that skips RAG preamble entirely, uses a simplified system prompt, and requires only the grounding + abstention compliance tests.

### Feedback Item 3: `cancelled` + dependency interaction unspecified

The Coordination Profile defines dependencies (blocks/requires/related) and the `cancelled` status, but doesn't specify what happens when these interact. Example: Card A blocks Card B. If Card A is cancelled, should Card B auto-unblock?

**Our implementation**: Yes, auto-unblock. When a card with "blocks" dependencies is cancelled, we automatically transition blocked cards to `in_progress` (if no other blocking deps remain). We also clear the `blockedReason`.

**Recommendation**: Add a normative section specifying dependency-status interaction rules. Implementers will make different choices without guidance.

### Feedback Item 4: Priority escalation extension

The Coordination Profile includes `priority` but no mechanism for tracking priority changes over time. In production, we auto-escalate overdue cards (24h past due) and blocked-timeout cards (blocked for 24h+). Tracking escalation history is essential for team leads to understand why priorities shifted.

**Recommendation**: Add a `coordination_escalation_trail` array to the Coordination Surface schema:
```json
{
  "escalation_trail": [
    {
      "reason": "overdue",
      "previous_priority": "medium",
      "new_priority": "high",
      "triggered_by": "system",
      "timestamp": "2026-02-06T18:00:00Z"
    }
  ]
}
```

### Feedback Item 5: `tez://` URI needs `?since=` parameter

The tez:// URI scheme works well for deep-linking to cards, context, and interrogation sessions. However, for living documents (linked sources like Google Sheets, Notion), time-scoped interrogation is essential. "What changed since last Tuesday?" requires a `since` parameter.

**Recommendation**: Add `?since=<ISO8601>` as a reserved query parameter in the tez:// URI spec for time-scoped interrogation of living documents.

### Feedback Item 6: Session transfer + rate limiting gap

The TIP spec defines query budgets per shared Tez, but doesn't address what happens when a Tez is reshared. If User A shares a Tez with User B (budget: 50 queries), and User B shares it with User C, does C get a fresh budget? Does it draw from B's? This is unspecified.

**Recommendation**: Define session transfer semantics. Our suggestion: resharing creates a new budget chain, but the original sender can set `max_depth: N` to limit resharing depth. Query budgets should be independent per recipient.

---

*These 6 items are based on production experience implementing v1.2.4 with real users. We're happy to provide usage data, code samples, or join a call to discuss any of these.*
