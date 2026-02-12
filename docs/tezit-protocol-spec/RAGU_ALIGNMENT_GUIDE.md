# Ragu Platform -- Tezit Protocol v1.2 Alignment Guide

**From**: Tezit Protocol Team
**To**: Ragu Platform Engineering Team
**Date**: February 2026
**Re**: Aligning Ragu Platform with Tezit Protocol v1.2.2 and TIP v1.0.2

---

## Executive Summary

The Ragu Platform is the second live implementer of the Tezit Protocol and the first enterprise platform. Your position is unique among implementers: Ragu is not a product that "added tez support" as a feature -- it is a full AI orchestration platform whose core capabilities *are* what the Tezit Protocol envisions. Your agentic RAG pipeline, fine-grained authorization, multi-model support, and document processing infrastructure directly implement the protocol's central promises: grounded interrogation, context integrity, and verifiable synthesis.

Your existing implementation in `packages/ragu-chat/src/ragu_chat/tez/` demonstrates deep engagement with the protocol. The data models (`TezBundle`, `TezManifest`, `ContextItem`, `NegotiableParameter`, `TezShare`, `TezPermissions`), the bundle assembly and consumption services, S3-backed storage, lineage tracking, and Chat-API integration form a working tez implementation that is, in several areas, ahead of the protocol specification itself.

**Key takeaway**: The alignment work here is primarily structural, not architectural. Your platform already does what the protocol requires. The work is to align field names, add v1.2 metadata, adopt the extended citation format, and formalize the contributions your team has already made to the protocol.

**Ragu's influence on the protocol**: Your team's contributions have directly shaped both the Tezit Protocol v1.2.2 and TIP v1.0.2. See Section 6 for a full accounting.

---

## 1. Architecture Mapping

Ragu's 11-microservice architecture maps naturally to Tezit Protocol concepts. This is not coincidental -- an AI platform that does retrieval-augmented synthesis over document collections *is* the Tezit vision, implemented as infrastructure.

### Service-to-Concept Mapping

| Ragu Service | Tezit Protocol Concept | Notes |
|---|---|---|
| `ragu-chat` (chat-api) | TIP interrogation engine | Already implements grounded Q&A over context. Your streaming SSE implementation influenced the TIP streaming spec. |
| `ragu-documents` (docs-api) | Context packaging, format-specific parsing | Handles PDF, DOCX, spreadsheets, code, audio transcription -- directly maps to TIP Section 10.2.4 (Mixed Media Handling). |
| `embedding-api` + `embedding-worker` | TIP retrieval infrastructure | Hybrid vector+keyword retrieval via OpenSearch implements TIP Section 10.1.6 (Retrieval Strategy) with the hybrid approach the spec recommends. |
| `eval-api` | `tezit-eval` extension | Your evaluation framework maps to a proposed standard extension for interrogation quality assessment. |
| `sync-api` | Living document sync (Section 8.3) | External source synchronization maps directly to linked source auto-versioning. |
| `browser-service` | Context acquisition for web sources | Web page capture and extraction for `webpage`-type context items. |
| `channels-api` | Transport layer for tez sharing | Multi-channel delivery of tezits across integrations. |
| `mcp-server` | Tool-based context acquisition | Extends the context window through structured tool access. |
| `sdk-api` | Tez HTTP API implementation | Programmatic access for tez creation, sharing, and interrogation. |
| OpenFGA | Per-item access control | Fine-grained authorization at document/chunk/operation level. Maps to the `com.ragu.fga-access` vendor extension (see Section 5). |
| S3 storage | Bundle storage | Your S3-backed storage already follows a directory structure compatible with the tez bundle format. |
| Aurora Serverless v2 | Manifest and metadata persistence | Stores manifest data, lineage, sharing records, and session state. |
| ElastiCache | Session state and retrieval caching | Supports TIP session management (Section 8) and retrieval result caching. |
| OpenSearch | Vector store + keyword index | Implements the hybrid retrieval strategy recommended in TIP Section 10.1.6. Your use of OpenSearch for both vector similarity and BM25 keyword search is the exact pattern the spec recommends. |

### The Key Insight

Most implementers will need to *build* a RAG pipeline to support interrogation. Ragu already *is* a RAG pipeline. The alignment work is about exposing your existing capabilities through the Tezit Protocol's standard interfaces and metadata formats, not about building new capabilities.

---

## 2. Data Model Alignment (v1.0/1.1 to v1.2.2)

Your existing data models were implemented against v1.0/1.1 of the protocol. The v1.2.2 specification introduces structural changes to the manifest schema, naming conventions, and metadata requirements. This section provides a field-by-field mapping.

### 2.1 TezBundle to v1.2.2 Bundle Structure

The v1.2.2 core bundle structure is:

```
{tez-id}/
  manifest.json          # REQUIRED
  tez.md                 # REQUIRED
  context/               # REQUIRED (may be empty)
    {item-id}.{ext}
  conversation.json      # OPTIONAL
  extensions/            # OPTIONAL
    {extension-id}/
```

**Key change**: `params.json` is no longer part of the core bundle. Parameters have moved to Appendix B (experimental) and are handled through the `tezit-parameters` extension under `extensions/`. Your `NegotiableParameter` model should be packaged as an extension rather than a top-level bundle artifact.

**Action**: Update `TezBundle` to reference the v1.2.2 structure. Your S3 directory layout should align with the canonical bundle hierarchy.

### 2.2 TezManifest Field Alignment

| Your Field | v1.2.2 Field | Change Required |
|---|---|---|
| `tez_version` | `tezit_version` | Rename. The field name was standardized in v1.2. |
| (missing) | `$schema` | Add. Reference `https://tezit.com/spec/v1.2/manifest.schema.json` |
| `id` | `id` | No change. |
| `version` | `version` | No change. Confirm it is an incrementing integer starting at 1. |
| `created_at` | `created_at` | No change. Confirm ISO 8601 format. |
| `updated_at` | `updated_at` | No change. |
| `creator` | `creator` | Confirm schema: `{ id, name, email, org, url }`. `name` is REQUIRED. |
| (missing) | `profile` | Add. Values: `knowledge`, `messaging`, `coordination`. See Section 2.5. |
| `synthesis` | `synthesis` | Confirm schema: `{ title, type, file, abstract, language }`. `title`, `type`, and `file` are REQUIRED. |
| `context` | `context` | Confirm schema includes `scope`, `item_count`, `total_size_bytes`, `items[]`. See Section 2.3. |
| `conversation` | `conversation` | Confirm schema: `{ model, turn_count, file, sharing }`. Add `sharing` field for privacy controls. |
| `lineage` | `lineage` | No change. Your `forked_from` and `fork_count` tracking already aligns. Add `related` array. |
| `permissions` | `permissions` | See Section 2.4. |
| (missing) | `extensions` | Add. Object keyed by extension ID. |

### 2.3 ContextItem Alignment

| Your Field | v1.2.2 Field | Change Required |
|---|---|---|
| `id` | `id` | No change. |
| `type` | `type` | Confirm against standard types: `document`, `email`, `spreadsheet`, `presentation`, `image`, `audio`, `video`, `code`, `data`, `webpage`, `message`, `note`, `custom`. |
| `title` | `title` | No change. |
| `source` | `source` | No change. |
| `file` | `file` | Confirm relative path within bundle. |
| `mime_type` | `mime_type` | No change. |
| `size_bytes` | `size_bytes` | No change. |
| (missing or inconsistent) | `hash` | **Add or standardize.** Format: `sha256:{hex}`. You already compute SHA-256 hashes for S3 deduplication -- expose this same hash in the manifest. This is REQUIRED for Level 3 (Platform Tez) conformance. |
| `metadata` | `metadata` | No change. Optional object for implementation-specific metadata. |

### 2.4 TezPermissions Alignment

| Your Field | v1.2.2 Field | Default |
|---|---|---|
| `interrogate` | `permissions.interrogate` | `true` |
| `fork` | `permissions.fork` | `true` |
| `reshare` | `permissions.reshare` | `false` |
| (missing) | `permissions.commercial_use` | `false` |
| (missing) | `permissions.license` | none (SPDX identifier) |

**Action**: Add `commercial_use` and `license` fields. Enterprise customers will need these for compliance.

### 2.5 Profile Support

Add a `profile` field to `TezManifest`. Ragu should support all three currently defined profiles:

- **`knowledge`** (default): The core profile. Synthesis document with cited analysis. Interrogation is the primary consumption model. This is what Ragu already does.
- **`messaging`**: Surface-centric communication with contextual depth beneath. See Appendix A of the v1.2.2 spec.
- **`coordination`**: Actionable items (tasks, decisions, blockers) backed by communication context. See Section 1.8.2 of the v1.2.2 spec and Section 7 below.

Your bundle assembly service should accept a `profile` parameter when creating tezits.

### 2.6 Conversation Privacy Controls

The v1.2.2 spec adds conversation privacy controls (Appendix D, Section D.3). Your `conversation` manifest field should support:

| Sharing Mode | Behavior |
|---|---|
| `full` | Complete conversation included |
| `summary` | AI-generated summary of reasoning (original excluded) |
| `redacted` | Conversation with sensitive turns removed |
| `excluded` | No conversation included (synthesis only) |

This is particularly important for enterprise customers who may want to share tezits externally without exposing internal reasoning. Your existing conversation handling should add a `sharing` field and support per-turn redaction.

### 2.7 Conformance Level Metadata

Add metadata indicating which conformance level a produced tez meets. Ragu should produce Level 3 (Platform Tez) bundles by default, but should also be able to:

- **Import** tezits at all levels (0-3), including Inline tezits (single `.md` files with YAML frontmatter)
- **Export** at Level 2 (Portable Tez) for cross-platform sharing
- **Upgrade** imported Level 0/1/2 tezits to Level 3 automatically

---

## 3. TIP Alignment

Ragu's core RAG pipeline already implements most of what the Tez Interrogation Protocol requires. In several areas, your implementation is *ahead* of the specification -- your contributions have directly influenced TIP v1.0.2 updates.

### 3.1 Grounding Boundary

Your RAG pipeline's context isolation maps to TIP's grounding boundary concept (TIP Section 2.6). When a user interrogates a tez on Ragu, the retrieval index MUST be scoped to that tez's context items only.

**Current state**: Your per-workspace document isolation via OpenFGA already provides this boundary. The alignment work is to formalize it: when interrogating a tez, the retrieval scope is the tez's `context/` directory, not the user's broader workspace.

**Action**: Ensure your chat-api's interrogation mode creates a scoped retrieval index limited to the tez bundle's context items, separate from the user's general document index.

### 3.2 Citation Format

TIP requires the double-bracket citation format `[[item-id:location]]`. The v1.2.2 spec extends this with element-level references.

**Basic citations** (already supported in TIP v1.0):
- `[[item-id]]` -- reference to entire context item
- `[[item-id:p12]]` -- page reference
- `[[item-id:L42-50]]` -- line range (code)
- `[[item-id:section-name]]` -- named section
- `[[item-id:t0:15:30]]` -- timestamp (audio/video)

**Extended element references** (adopted in Protocol v1.2.2, from Ragu's proposal):
- `[[item-id:p12:table-3]]` -- table on a specific page
- `[[item-id:p12:figure-1]]` -- figure on a specific page
- `[[item-id:section-3.2:para-4]]` -- paragraph within a section
- `[[item-id:p5:equation-2]]` -- equation on a page
- `[[item-id:p8:footnote-7]]` -- footnote on a page

Your document processing pipeline already tracks these sub-page elements. The alignment work is to emit them in the standard `[[item-id:location:element]]` three-part format rather than any internal representation.

### 3.3 Response Classification

TIP defines four response classifications (TIP Section 6). Your chat-api responses should include classification metadata:

| Classification | When to Use | Ragu Mapping |
|---|---|---|
| **Grounded** | Every claim directly supported by context with citations | Your standard RAG responses when all claims have chunk provenance |
| **Inferred** | Logical deductions explicitly labeled as such | When your pipeline synthesizes across chunks with reasoning |
| **Partial** | Some claims grounded, some gaps identified | When retrieval returns partial coverage |
| **Abstention** | Context insufficient to answer | When retrieval returns no relevant chunks above threshold |

**Action**: Add a `classification` field to your interrogation response schema. Classify each response using the four-tier system.

### 3.4 Streaming Citation Events

Your streaming SSE implementation for interrogation was *ahead* of the spec. The TIP streaming specification (TIP Section 15.7) now formalizes SSE event types that were directly influenced by your implementation:

```
event: tip.session.start
data: {"session_id": "...", "tez_id": "..."}

event: tip.token
data: {"delta": "The revenue increased by "}

event: tip.citation
data: {"item_id": "revenue-report", "location": "p3", "text_excerpt": "Revenue grew 23% YoY", "verified": true}

event: tip.token
data: {"delta": "23% year-over-year [[revenue-report:p3]]."}

event: tip.response.end
data: {"classification": "grounded", "confidence": "high", "citation_count": 5}
```

**Your contribution**: The `tip.citation` event -- emitted inline during generation as soon as the RAG pipeline identifies a grounded reference -- was your team's proposal. This enables progressive trust-building: recipients see citation verification in real time rather than waiting for the complete response. This has been adopted in TIP v1.0.2.

**Action**: Align your existing SSE event names to the `tip.*` namespace. Ensure your streaming responses emit `tip.session.start`, `tip.token`, `tip.citation`, and `tip.response.end` events per the spec.

### 3.5 Retrieval Transparency Metadata

Your proposal for optional retrieval transparency metadata has been adopted in TIP v1.0.2. This allows interrogation responses to include information about *how* the RAG pipeline retrieved relevant chunks, enabling recipients and auditors to understand the retrieval process.

This metadata is OPTIONAL but RECOMMENDED for platforms like Ragu that operate full RAG pipelines. It includes:

- Which chunks were retrieved and their similarity scores
- Which retrieval strategy was used (semantic, keyword, hybrid)
- Whether multi-pass retrieval was employed
- Total chunks searched vs. chunks returned

Your OpenSearch pipeline already tracks this information internally. The alignment work is to surface it in the response metadata when requested.

### 3.6 Retrieval Strategy Hints

Your proposal for a `retrieval_strategy` hint in the manifest has been adopted in TIP v1.0.2. Tez creators can now indicate a preferred retrieval strategy:

```json
{
  "interrogation": {
    "retrieval_strategy": "hybrid",
    "recommended_models": ["claude-sonnet-4", "gpt-4o"],
    "min_context_window": 32000
  }
}
```

This is advisory -- recipient platforms are free to use their own strategy. But for sender-hosted interrogation (where Ragu provides the compute), this hint controls your own pipeline behavior.

### 3.7 TIP Lite

TIP Lite is for small-context tezits where the total context is under 32,768 tokens. Your pipeline already supports this implicitly: when context is small enough, you load it entirely into the prompt without chunking or retrieval.

**Clarification adopted in TIP v1.0.2** (from your feedback): The 32,768-token threshold is now explicitly configurable per implementation. Platforms with large-context models (128K+ windows) may raise this threshold. The requirement is that all context is loaded in full, not that the threshold is exactly 32K.

**Action**: Formalize your full-prompt-loading path as TIP Lite conformance. When a tez's total context is below your configurable threshold, skip the RAG pipeline and load everything directly.

### 3.8 Multi-Pass Retrieval

TIP Section 10.2.2 specifies that when retrieved chunks do not appear to address the query, the system SHOULD perform a second retrieval pass with a reformulated query before abstaining. Your pipeline already implements multi-pass retrieval. No alignment work needed -- this is documentation, not implementation.

---

## 4. Conformance Level Target

Given Ragu's capabilities, your target is **Level 3 -- Platform Tez** conformance with full TIP compliance.

### Level 3 Checklist

- [ ] Full manifest schema with `$schema` reference to `https://tezit.com/spec/v1.2/manifest.schema.json`
- [ ] `tezit_version` field (renamed from `tez_version`)
- [ ] `profile` field support (`knowledge`, `messaging`, `coordination`)
- [ ] Complete creator metadata (`id`, `name`, `email`, `org`, `url`)
- [ ] SHA-256 hashes for all context items (format: `sha256:{hex}`)
- [ ] Typed context items with all standard fields (`id`, `type`, `title`, `source`, `file`, `mime_type`, `size_bytes`, `hash`, `metadata`)
- [ ] Conversation privacy controls (`full`, `summary`, `redacted`, `excluded`)
- [ ] Per-turn redaction support
- [ ] Lineage tracking (`forked_from`, `fork_count`, `related`)
- [ ] Permission fields (`interrogate`, `fork`, `reshare`, `commercial_use`, `license`)
- [ ] Extension support (`tezit-facts`, `tezit-relationships`, vendor extensions)
- [ ] Inline Tez (Level 0) import -- parse single `.md` files with YAML frontmatter
- [ ] Portable Tez (Level 2) export -- generate minimal manifests for cross-platform sharing
- [ ] Round-trip preservation of unknown fields

### TIP Compliance Checklist

- [ ] Grounded responses: all factual claims cite transmitted context only
- [ ] Citation format: `[[item-id:location]]` (and extended `[[item-id:location:element]]`)
- [ ] Response classification: `grounded`, `inferred`, `partial`, `abstention`
- [ ] Confidence signals: `high`, `medium`, `low`
- [ ] Citation verification: post-process all responses to validate cited item IDs and locations exist
- [ ] Session isolation: cross-session, cross-tez, cross-user, temporal
- [ ] Abstention over hallucination: explicit refusal when context is insufficient
- [ ] System prompt compliance: follows TIP Section 4.1 normative template
- [ ] Streaming SSE: `tip.session.start`, `tip.token`, `tip.citation`, `tip.response.end` events
- [ ] Passes all seven compliance tests (TIP Section 11)

### What You Already Have

The majority of these requirements are already implemented in your pipeline. The unchecked items above are primarily:

1. **Metadata alignment** -- adding fields, renaming fields, adding `$schema` references
2. **Response annotation** -- classifying responses, adding confidence signals
3. **SSE event naming** -- renaming your existing events to the `tip.*` namespace
4. **Import/export** -- supporting Inline Tez import and Portable Tez export

None of these require new architectural capabilities.

---

## 5. Extension Development

### 5.1 Standard Extensions

Ragu should support the following standard extensions from the v1.2.2 spec:

**`tezit-facts`** (Appendix C.1): Structured claims with confidence and provenance. Your document processing pipeline likely already extracts factual claims -- wrapping them in the `tezit-facts` schema adds interoperability.

```json
{
  "facts": [
    {
      "id": "fact-001",
      "claim": "Revenue increased 23% year-over-year",
      "confidence": 0.95,
      "source": "verified",
      "citations": ["revenue-report:p3"],
      "verifiedBy": "ragu-eval-pipeline",
      "category": "financial"
    }
  ]
}
```

**`tezit-relationships`** (Appendix C.2): Entity relationship mapping. Your entity extraction and knowledge graph capabilities map directly to this extension.

**`tezit-parameters`** (Appendix B): Negotiable parameters for deal-oriented tezits. Your existing `NegotiableParameter` model should be re-housed under this extension. Align with the `params.json` schema defined in Appendix B.2.

### 5.2 Vendor Extensions

Ragu's vendor extension namespace `com.ragu.*` is reserved. The following vendor extensions are appropriate for Ragu-specific capabilities that go beyond the core protocol:

**`com.ragu.fga-access`**: Fine-grained authorization metadata. Your OpenFGA integration provides per-document, per-chunk, per-operation access control that exceeds the protocol's advisory permission model. This extension can carry the authorization policy alongside the tez.

```json
{
  "extensions": {
    "com.ragu.fga-access": {
      "authorization_model": "document-level",
      "policy_store": "openfga",
      "per_item_policies": {
        "doc-001": {
          "read": ["org:legal-team"],
          "interrogate": ["org:all-employees"],
          "fork": ["role:analyst"]
        }
      }
    }
  }
}
```

**`com.ragu.eval`**: Interrogation quality evaluation metrics. Your eval-api can assess interrogation quality (groundedness, citation accuracy, abstention appropriateness) and store results as extension metadata. This maps to the proposed `tezit-eval` standard extension.

**`com.ragu.retrieval-config`**: RAG pipeline configuration for sender-hosted interrogation. When sharing tezits with sender-hosted interrogation, this extension carries the retrieval settings (chunk size, overlap, embedding model, hybrid weights) so recipients using Ragu's compute get the same quality experience.

**`com.ragu.multi-model`**: Model routing and fallback configuration. Your multi-model support (Anthropic, OpenAI, AWS Bedrock, Jina, local models) can be encoded as an extension for sender-hosted sessions.

### 5.3 Extension Registry

The protocol v1.2.2 establishes an extension registry process (from your team's proposal). Standard extensions are maintained at [github.com/tezit-protocol/spec/extensions](https://github.com/tezit-protocol/spec/extensions). Vendor extensions should be registered at [tezit.com/extensions](https://tezit.com/extensions) for discoverability.

---

## 6. Contribution Recognition

Your team's contributions have directly shaped the Tezit Protocol. The following protocol features exist because of Ragu Platform's implementation experience and proposals:

### Adopted in TIP v1.0.2

| Contribution | Description | Spec Location |
|---|---|---|
| **Streaming citation events** | The `tip.citation` SSE event type, emitted inline during generation for progressive trust-building | TIP Section 15.7 |
| **Retrieval transparency metadata** | Optional metadata exposing retrieval pipeline details (chunks retrieved, similarity scores, strategy used) | TIP Section 10.1.7 (extended) |
| **Retrieval strategy hints** | The `retrieval_strategy` field in the manifest's `interrogation` object | TIP Section 10.1.6 |
| **TIP Lite threshold clarification** | Configurable threshold (not fixed at 32K) for full-prompt-loading eligibility | TIP Section 1.5.2 |

### Adopted in Protocol v1.2.2

| Contribution | Description | Spec Location |
|---|---|---|
| **Extended citation location syntax** | Three-part `[[item-id:location:element]]` format for sub-location references (tables, figures, paragraphs) | Section 4.2.1 |
| **Living document failure modes** | Schema for source unavailability, degraded context, and freshness warnings | Section 8.3.1 |
| **Extension registry process** | Formal process for registering standard and vendor extensions | Section 11.4 |
| **Code Review profile** | Proposed as a profile for code analysis tezits with line-level citations | Section 1.8.4 (future profiles) |

### Proposed (Under Consideration)

| Contribution | Description | Status |
|---|---|---|
| **`tezit-eval` extension** | Standard extension for interrogation quality evaluation (groundedness scoring, citation accuracy, abstention appropriateness) | Proposed for Appendix C |
| **Coordination Profile co-design** | Formal profile for team collaboration items (tasks, decisions, blockers) backed by communication context | Accepted; Ragu invited to co-author (see Section 7) |

### The Broader Impact

Ragu's contributions reflect the reality that enterprise AI platforms encounter problems the protocol must address. Your streaming implementation exposed the need for real-time citation verification. Your document processing pipeline revealed the need for element-level citations. Your production infrastructure surfaced failure modes that the living document spec needed to handle. This feedback loop -- from implementation to specification -- is exactly how the protocol improves.

---

## 7. Coordination Profile Co-Design

The Coordination Profile (Section 1.8.2 of the v1.2.2 spec) is under active development, and Ragu is invited to co-author the specification.

### Why Ragu

Your platform's orchestration model -- where AI agents coordinate tasks, decisions, and information flow across teams -- is the natural implementation substrate for coordination tezits. The Coordination Profile formalizes what your platform already does: producing actionable items backed by the communication context that produced them.

### Profile Structure

The current Coordination Profile draft defines:

```json
{
  "profile": "coordination",
  "surface": {
    "item_type": "blocker",
    "title": "Auth service migration blocked on legacy SAML adapter",
    "status": "pending",
    "assignee": {
      "name": "Marcus Chen",
      "email": "marcus@company.com",
      "role": "assignee"
    },
    "due_date": "2026-02-14",
    "recipients": [
      { "name": "Marcus Chen", "role": "assignee" },
      { "name": "Priya Patel", "role": "reviewer" },
      { "name": "Engineering Leads", "role": "informed" }
    ]
  }
}
```

### Co-Design Areas

We are looking for Ragu's input on:

1. **Orchestrator integration**: How coordination tezits interact with AI orchestration -- can an agent system produce, consume, and act on coordination tezits autonomously?
2. **Status lifecycle**: The current `pending/acknowledged/completed` status model may be too simple for enterprise workflows. What statuses does Ragu's orchestration layer track?
3. **Dependency modeling**: How do coordination tezits reference blockers, prerequisites, and dependencies on other coordination tezits?
4. **Escalation patterns**: When a blocker remains unresolved, how should the protocol support escalation with preserved context?
5. **Batch coordination**: Can a single tez represent multiple related coordination items (e.g., a sprint's worth of tasks)?

### Process

1. Ragu submits a formal Coordination Profile proposal based on your orchestrator model
2. Joint design review between Ragu and Tezit Protocol teams
3. Prototype implementation in Ragu
4. Interoperability testing with MyPA.chat (the other implementer)
5. Formal adoption into the protocol specification

---

## 8. Recommended Implementation Phases

### Phase A: v1.2.2 Data Model Alignment

**Scope**: Manifest schema updates, field naming, conformance metadata.

**Tasks**:
1. Rename `tez_version` to `tezit_version` across all models and storage
2. Add `$schema` reference to all produced manifests
3. Add `profile` field support to `TezManifest`
4. Standardize `ContextItem.hash` to `sha256:{hex}` format (leverage existing S3 dedup hashes)
5. Add `permissions.commercial_use` and `permissions.license` fields
6. Add conversation privacy controls (`sharing` mode, per-turn redaction)
7. Move `NegotiableParameter` from top-level to `tezit-parameters` extension
8. Add Inline Tez (Level 0) import support -- parse `.md` files with YAML frontmatter
9. Add Portable Tez (Level 2) export capability

**Estimated effort**: Low. These are field renames, additions, and schema adjustments to existing models.

### Phase B: TIP Alignment

**Scope**: Citation format, response classification, grounding boundary formalization.

**Tasks**:
1. Formalize interrogation mode with scoped retrieval index (tez context only, not workspace)
2. Ensure citation output uses `[[item-id:location]]` format in all responses
3. Add extended element references (`[[item-id:location:element]]`) to citation generation
4. Add response classification (`grounded`, `inferred`, `partial`, `abstention`) to all interrogation responses
5. Add confidence signals (`high`, `medium`, `low`) to response metadata
6. Implement post-generation citation verification (validate item IDs and locations exist)
7. Rename streaming SSE events to `tip.*` namespace
8. Implement TIP Lite path: full prompt loading when context is below configurable threshold
9. Run against TIP compliance test suite (all seven tests)

**Estimated effort**: Medium. Most capabilities exist; the work is annotation, classification, and verification wrappers.

### Phase C: Extension Development

**Scope**: Standard extension support and vendor extension namespace.

**Tasks**:
1. Implement `tezit-facts` extension support (import and export)
2. Implement `tezit-relationships` extension support
3. Re-house `NegotiableParameter` as `tezit-parameters` extension
4. Develop `com.ragu.fga-access` vendor extension for fine-grained authorization metadata
5. Develop `com.ragu.eval` vendor extension for interrogation quality metrics
6. Register vendor extensions at [tezit.com/extensions](https://tezit.com/extensions)

**Estimated effort**: Medium. Extension schema implementation plus registry registration.

### Phase D: Interoperability Testing

**Scope**: Round-trip validation, conformance test bundles, cross-platform verification.

**Tasks**:
1. Produce Level 3 conformance test bundles from Ragu
2. Validate that Ragu-produced tezits can be consumed by other Tezit-compatible platforms
3. Import test bundles from the reference test suite at [github.com/tezit-protocol/spec/tests](https://github.com/tezit-protocol/spec/tests)
4. Verify round-trip preservation (import a tez, export it, confirm all fields preserved)
5. Test Inline Tez (Level 0) import from external sources
6. Submit conformance test results for certification consideration

**Estimated effort**: Low-Medium. Primarily testing and validation, minimal new code.

### Phase E: Coordination Profile Co-Design

**Scope**: Formal proposal and prototype implementation of the Coordination Profile.

**Tasks**:
1. Draft formal Coordination Profile proposal based on Ragu's orchestrator model
2. Joint design review with Tezit Protocol team
3. Prototype coordination tez creation and consumption in Ragu
4. Interoperability testing with MyPA.chat
5. Iterate based on cross-platform testing results
6. Submit final proposal for protocol adoption

**Estimated effort**: Medium-High. This is design work, not just implementation.

---

## 9. Partnership Framework

### Specification Co-Authorship

Ragu is invited to co-author the Coordination Profile specification. This is a recognition of your team's deep understanding of AI-orchestrated collaboration and your platform's natural fit as the implementation substrate for coordination tezits.

### Namespace Reservation

The vendor extension namespace `com.ragu.*` is permanently reserved for Ragu Platform. Extensions registered under this namespace are maintained by your team and hosted in your own repositories. The extension registry at [tezit.com/extensions](https://tezit.com/extensions) will link to your documentation.

### Interoperability Commitment

Both parties commit to:

- **Bidirectional testing**: Ragu produces tezits that other platforms consume; other platforms produce tezits that Ragu consumes
- **Regression testing**: Protocol spec changes are validated against Ragu's implementation before release
- **Feedback loop**: Implementation experience feeds back into spec improvements (as it already has)

### Certification

Conformance certification (available at [tezit.com/certification](https://tezit.com/certification)) will be operational when the certification infrastructure launches. Ragu's existing implementation likely qualifies for early certification given the depth of your protocol engagement and the contributions your team has already made to the specification. Your platform would be among the first certified enterprise implementations.

### Spec Feedback Channel

Protocol issues and proposals should be submitted to [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec). Ragu team members are welcome as spec reviewers.

---

## Schema Mapping Reference

A complete field mapping between Ragu's current internal models and Tezit Protocol v1.2.2:

| Ragu Model / Field | Tezit Protocol v1.2.2 | Notes |
|---|---|---|
| `TezManifest.tez_version` | `manifest.tezit_version` | Rename |
| `TezManifest.id` | `manifest.id` | No change |
| `TezManifest.version` | `manifest.version` | No change |
| `TezManifest.created_at` | `manifest.created_at` | No change |
| `TezManifest.updated_at` | `manifest.updated_at` | No change |
| `TezManifest.creator` | `manifest.creator` | Confirm schema alignment |
| (missing) | `manifest.profile` | Add: `knowledge`, `messaging`, `coordination` |
| (missing) | `manifest.$schema` | Add: `https://tezit.com/spec/v1.2/manifest.schema.json` |
| `TezManifest.synthesis` | `manifest.synthesis` | Confirm: `title`, `type`, `file` REQUIRED |
| `TezManifest.context` | `manifest.context` | Confirm: `scope`, `item_count` REQUIRED |
| `ContextItem.id` | `context.items[].id` | No change |
| `ContextItem.type` | `context.items[].type` | Validate against standard types |
| `ContextItem.title` | `context.items[].title` | No change |
| `ContextItem.file` | `context.items[].file` | Relative path within bundle |
| (internal S3 hash) | `context.items[].hash` | Expose as `sha256:{hex}` |
| `NegotiableParameter.*` | `extensions/tezit-parameters/params.json` | Move from top-level to extension |
| `TezPermissions.interrogate` | `permissions.interrogate` | No change |
| `TezPermissions.fork` | `permissions.fork` | No change |
| `TezPermissions.reshare` | `permissions.reshare` | No change |
| (missing) | `permissions.commercial_use` | Add (default: `false`) |
| (missing) | `permissions.license` | Add (SPDX identifier) |
| `TezShare.forked_from` | `lineage.forked_from` | No change |
| `TezShare.fork_count` | `lineage.fork_count` | No change |
| (missing) | `lineage.related` | Add (array of tez-ids or URIs) |

---

## Naming Conventions

Please update all references throughout the Ragu codebase:

- **Singular**: "a tez" (one knowledge bundle)
- **Plural**: "tezits" (multiple knowledge bundles). NOT "tezzes"
- **Protocol/Brand**: "Tezit" (also used as a verb: *"I'll tezit it over"*)
- **Gerund**: "teziting" (*"She was teziting the research to the legal team"*)

Search your codebase for any instances of "tezzes" and replace with "tezits".

---

## Reference Documents

- **Protocol Spec (v1.2.2)**: See `TEZIT_PROTOCOL_SPEC_v1.2.md` or [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)
- **Tez Interrogation Protocol (TIP)**: See `TEZ_INTERROGATION_PROTOCOL.md`
- **Tez HTTP API**: See `TEZ_HTTP_API_SPEC.md`
- **`tez://` URI Scheme**: Defined in the companion specifications
- **Platform Architecture**: See `TEZIT_PLATFORM.md`
- **Philosophy**: See `TEZIT_MANIFESTO.md`
- **MyPA.chat Alignment Guide**: See `MYPA_ALIGNMENT_GUIDE.md` (for cross-reference with the other implementer)

---

*Document prepared by Tezit Protocol Team, February 2026*
*Tezit Protocol v1.2.2 -- [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)*
