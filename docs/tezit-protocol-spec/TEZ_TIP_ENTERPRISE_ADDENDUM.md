# TIP Enterprise Addendum

**Specification**: Tez Interrogation Protocol (TIP) -- Enterprise Addendum
**Version**: 1.1-draft
**Status**: Draft for Review
**Date**: February 5, 2026
**Authors**: Ragu Platform Team
**Extends**: TEZ_INTERROGATION_PROTOCOL.md v1.0
**Repository**: [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)

---

## Abstract

This document is an addendum to the Tez Interrogation Protocol (TIP) v1.0
specification. It extends TIP with patterns required for enterprise deployment:
streaming interrogation, fine-grained authorization within tez bundles,
retrieval transparency, multi-pass retrieval strategies, multi-tenant
isolation, high-throughput operation, and interrogation quality evaluation.

The patterns described herein are derived from a production enterprise AI
platform (Ragu) that implements TIP at scale across multiple organizations,
with fine-grained authorization, hybrid retrieval, and real-time streaming.
These are not theoretical proposals. Every section reflects capabilities that
have been built, deployed, and operated in a multi-tenant enterprise
environment.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Streaming Interrogation Protocol](#2-streaming-interrogation-protocol)
3. [FGA-Scoped Interrogation](#3-fga-scoped-interrogation)
4. [Retrieval Transparency](#4-retrieval-transparency)
5. [Multi-Pass Retrieval Strategies](#5-multi-pass-retrieval-strategies)
6. [Multi-Tenant Isolation](#6-multi-tenant-isolation)
7. [High-Throughput Interrogation](#7-high-throughput-interrogation)
8. [Interrogation Quality Evaluation](#8-interrogation-quality-evaluation)
9. [Conformance](#9-conformance)
10. [Security Considerations](#10-security-considerations)
11. [Change Log](#11-change-log)

---

## 1. Introduction

### 1.1 Motivation

TIP v1.0 defines a sound interrogation model: grounded response generation,
citation verification, response classification, session management, and
compliance testing. It is sufficient for single-user, single-tez, synchronous
interrogation against a static context bundle.

Enterprise deployments introduce requirements that TIP v1.0 does not address:

- **Real-time delivery**: Enterprise applications stream responses to users
  via Server-Sent Events (SSE). Citations emitted mid-stream enable
  progressive verification. TIP describes request/response; this addendum
  defines the streaming wire protocol.

- **Per-item authorization**: Enterprise tez bundles frequently contain context
  items with heterogeneous sensitivity levels. A single tez may include public
  filings and privileged memoranda. TIP assumes binary access; this addendum
  defines per-item access control.

- **Retrieval auditability**: Enterprise consumers -- compliance officers,
  auditors, quality engineers -- need visibility into how citations were
  produced. TIP treats retrieval as opaque; this addendum defines retrieval
  metadata.

- **Complex query handling**: Enterprise interrogation queries frequently span
  multiple topics across many context items. Single-pass retrieval produces
  incomplete results for such queries. This addendum defines multi-pass
  retrieval strategies.

- **Tenant boundaries**: Enterprise platforms serve multiple organizations on
  shared infrastructure. TIP does not address tenant isolation. This addendum
  defines tenant-scoped interrogation requirements.

- **Operational scale**: Enterprise deployments handle hundreds of concurrent
  interrogation sessions. This addendum defines guidance for connection
  management, caching, rate limiting, and backpressure.

- **Quality measurement**: There is no current guidance on measuring
  interrogation quality. This addendum defines the `tezit-eval` extension
  for standardized quality metrics.

### 1.2 Scope

This addendum is OPTIONAL. Implementations that do not require enterprise
features MAY ignore this document entirely and remain fully TIP-compliant.

Implementations that adopt this addendum MUST implement the sections they
claim conformance to independently. Partial adoption is explicitly supported
(see Section 9).

### 1.3 Relationship to TIP v1.0

This addendum does not modify any normative requirement of TIP v1.0. All
definitions, response classifications, citation formats, and grounding
requirements from TIP v1.0 remain in effect. This addendum adds new
OPTIONAL capabilities that extend TIP for enterprise use.

Where this addendum introduces new fields in existing schemas (e.g., adding
`retrieval` to citation objects), those fields are always OPTIONAL and MUST
NOT cause validation failures in implementations that do not support them.

---

## 2. Streaming Interrogation Protocol

### 2.1 Overview

TIP v1.0 describes interrogation as synchronous request/response. Enterprise
applications SHOULD support streaming interrogation via Server-Sent Events
(SSE), enabling progressive response delivery with mid-stream citation events.

Streaming interrogation allows recipients to begin reading and verifying
responses before generation completes. For responses grounded in many context
items, this reduces perceived latency and enables progressive trust-building.

### 2.2 Transport

Streaming interrogation MUST use Server-Sent Events (SSE) as defined in the
[WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/server-sent-events.html).

The HTTP response MUST include:

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

The `X-Accel-Buffering: no` header is RECOMMENDED to prevent reverse proxies
from buffering the event stream.

### 2.3 Event Types

Implementations supporting streaming interrogation MUST emit events using the
following types. Each event is a standard SSE event with an `event` field and
a `data` field containing a JSON object.

#### 2.3.1 tip.session.start

Emitted once when the interrogation session is initialized.

```
event: tip.session.start
data: {
  "tez_id": "acme-analysis-2026-01",
  "session_id": "sess_abc123",
  "model": "claude-sonnet-4",
  "context_item_count": 12,
  "timestamp": "2026-02-05T14:30:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tez_id` | string | REQUIRED | Tez bundle identifier |
| `session_id` | string | REQUIRED | Unique session identifier |
| `model` | string | OPTIONAL | Model used for generation |
| `context_item_count` | integer | OPTIONAL | Number of context items in scope |
| `timestamp` | string | REQUIRED | ISO 8601 timestamp |

#### 2.3.2 tip.context.loaded

Emitted once after the context has been indexed and is ready for retrieval.

```
event: tip.context.loaded
data: {
  "item_count": 12,
  "total_tokens": 48500,
  "indexed_items": ["doc-001", "doc-002", "email-003"],
  "timestamp": "2026-02-05T14:30:01Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `item_count` | integer | REQUIRED | Number of items indexed |
| `total_tokens` | integer | OPTIONAL | Total token count of indexed context |
| `indexed_items` | array | OPTIONAL | List of item IDs successfully indexed |
| `timestamp` | string | REQUIRED | ISO 8601 timestamp |

#### 2.3.3 tip.retrieval.start

Emitted when retrieval begins for a query.

```
event: tip.retrieval.start
data: {
  "query": "What drives the 6-week timeline?",
  "strategy": "hybrid",
  "timestamp": "2026-02-05T14:30:02Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | REQUIRED | The retrieval query (may differ from user query if decomposed) |
| `strategy` | string | OPTIONAL | Retrieval strategy: `single_pass`, `multi_pass`, `exhaustive`, `iterative` |
| `timestamp` | string | REQUIRED | ISO 8601 timestamp |

#### 2.3.4 tip.retrieval.chunk

OPTIONAL. Emitted for each chunk retrieved. Implementations MAY omit this
event type for performance. When emitted, it provides transparency into the
retrieval process.

```
event: tip.retrieval.chunk
data: {
  "item_id": "client-specs",
  "chunk_id": "chunk_0042",
  "location": "p12",
  "score": 0.89,
  "method": "hybrid",
  "tokens": 412,
  "timestamp": "2026-02-05T14:30:02.150Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `item_id` | string | REQUIRED | Context item identifier |
| `chunk_id` | string | OPTIONAL | Internal chunk identifier for audit |
| `location` | string | OPTIONAL | Location within the item (page, section, line) |
| `score` | number | OPTIONAL | Retrieval relevance score (0.0-1.0) |
| `method` | string | OPTIONAL | Retrieval method that produced this chunk |
| `tokens` | integer | OPTIONAL | Token count of the chunk |
| `timestamp` | string | REQUIRED | ISO 8601 timestamp |

#### 2.3.5 tip.token

Emitted for each response token delta. This is the primary event for
progressive response rendering.

```
event: tip.token
data: {
  "delta": "The timeline is driven by three "
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `delta` | string | REQUIRED | The token or token group to append |

Implementations SHOULD batch tokens into groups of 1-5 tokens for efficiency.
Single-character emission is NOT RECOMMENDED due to overhead.

#### 2.3.6 tip.citation

Emitted when a citation is verified during generation. This event MUST be
emitted as soon as the citation is confirmed, not deferred to response
completion. Mid-stream citation emission enables progressive verification.

```
event: tip.citation
data: {
  "item_id": "client-specs",
  "location": "p12",
  "text_excerpt": "Custom SAML 2.0 implementation with non-standard attribute mappings",
  "verified": true,
  "citation_index": 1,
  "retrieval": {
    "method": "hybrid",
    "vector_score": 0.89,
    "keyword_score": 0.72,
    "hybrid_score": 0.83,
    "rank": 1,
    "chunk_id": "chunk_0042",
    "chunk_tokens": 412,
    "reranked": true,
    "rerank_score": 0.91
  },
  "timestamp": "2026-02-05T14:30:03Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `item_id` | string | REQUIRED | Context item identifier |
| `location` | string | OPTIONAL | Location within item (per TIP citation format) |
| `text_excerpt` | string | RECOMMENDED | Excerpt of cited text for verification |
| `verified` | boolean | REQUIRED | Whether the citation passed verification |
| `citation_index` | integer | OPTIONAL | Sequential citation number in response |
| `retrieval` | object | OPTIONAL | Retrieval metadata (see Section 4) |
| `timestamp` | string | REQUIRED | ISO 8601 timestamp |

#### 2.3.7 tip.response.end

Emitted once when response generation is complete.

```
event: tip.response.end
data: {
  "classification": "grounded",
  "confidence": "high",
  "citation_count": 5,
  "tokens_used": {
    "prompt": 12400,
    "completion": 850,
    "total": 13250
  },
  "retrieval_summary": {
    "chunks_retrieved": 15,
    "chunks_used": 8,
    "items_referenced": 3
  },
  "timestamp": "2026-02-05T14:30:05Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `classification` | string | REQUIRED | Per TIP: `grounded`, `inferred`, `partial`, `abstention` |
| `confidence` | string | REQUIRED | Per TIP: `high`, `medium`, `low` |
| `citation_count` | integer | REQUIRED | Total verified citations in response |
| `tokens_used` | object | OPTIONAL | Token usage breakdown |
| `retrieval_summary` | object | OPTIONAL | Summary of retrieval activity |
| `timestamp` | string | REQUIRED | ISO 8601 timestamp |

#### 2.3.8 tip.session.end

Emitted when the interrogation session is closed.

```
event: tip.session.end
data: {
  "session_id": "sess_abc123",
  "total_queries": 5,
  "total_tokens": 67200,
  "duration_ms": 45000,
  "timestamp": "2026-02-05T14:45:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | REQUIRED | Session identifier |
| `total_queries` | integer | REQUIRED | Number of queries in the session |
| `total_tokens` | integer | OPTIONAL | Total tokens consumed |
| `duration_ms` | integer | OPTIONAL | Session duration in milliseconds |
| `timestamp` | string | REQUIRED | ISO 8601 timestamp |

#### 2.3.9 tip.error

Emitted when an error occurs during interrogation. After emitting this event,
the implementation SHOULD close the SSE connection.

```
event: tip.error
data: {
  "code": "CONTEXT_LOAD_FAILED",
  "message": "Unable to index context item: doc-007 (corrupted PDF)",
  "item_id": "doc-007",
  "recoverable": false,
  "timestamp": "2026-02-05T14:30:01Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | REQUIRED | Machine-readable error code |
| `message` | string | REQUIRED | Human-readable error description |
| `item_id` | string | OPTIONAL | Context item that caused the error |
| `recoverable` | boolean | OPTIONAL | Whether the client should retry |
| `timestamp` | string | REQUIRED | ISO 8601 timestamp |

**Standard error codes:**

| Code | Meaning |
|------|---------|
| `SESSION_EXPIRED` | Session has exceeded its TTL |
| `CONTEXT_LOAD_FAILED` | One or more context items failed to load |
| `RETRIEVAL_FAILED` | Retrieval system unavailable or errored |
| `GENERATION_FAILED` | Model generation failed |
| `RATE_LIMITED` | Request exceeds rate limit |
| `AUTHORIZATION_DENIED` | Caller lacks permission for this operation |
| `BUDGET_EXHAUSTED` | Interrogation budget for this share has been consumed |
| `INTERNAL_ERROR` | Unclassified server error |

### 2.4 Event Ordering

Events MUST be emitted in the following order:

1. `tip.session.start` (exactly once per session)
2. `tip.context.loaded` (exactly once per session)
3. For each query in the session:
   a. `tip.retrieval.start` (exactly once per query)
   b. `tip.retrieval.chunk` (zero or more, if enabled)
   c. `tip.token` and `tip.citation` (interleaved, zero or more)
   d. `tip.response.end` (exactly once per query)
4. `tip.session.end` (exactly once per session)

`tip.error` MAY occur at any point in the stream. If a non-recoverable error
occurs, the implementation MUST emit `tip.error` and then close the connection.

### 2.5 Reconnection

If the SSE connection drops, the client MAY reconnect using the standard SSE
`Last-Event-ID` mechanism. Implementations supporting reconnection MUST assign
unique IDs to each event via the SSE `id` field and MUST replay missed events
upon reconnection.

Implementations that do not support reconnection MUST omit the SSE `id` field,
signaling to clients that reconnection replay is not available.

---

## 3. FGA-Scoped Interrogation

### 3.1 Overview

TIP v1.0 defines the grounding boundary as the entire tez bundle: a recipient
either has access to interrogate the full bundle or does not. Enterprise tez
bundles frequently contain context items with different sensitivity levels
served to recipients with different authorization scopes.

FGA-Scoped Interrogation extends TIP to support per-context-item access
control, enabling a single tez to serve multiple audiences with
audience-appropriate grounding boundaries.

### 3.2 Access Control Model

Each context item in the manifest MAY include an `access` field that defines
who can read that item during interrogation.

```json
{
  "context": {
    "items": [
      {
        "id": "public-filing",
        "type": "document",
        "title": "2025 Annual Report (Public)",
        "file": "context/public-filing.pdf",
        "access": {
          "type": "public"
        }
      },
      {
        "id": "board-minutes",
        "type": "document",
        "title": "Board Meeting Minutes - January 2026",
        "file": "context/board-minutes.pdf",
        "access": {
          "type": "fga",
          "object": "document:board-minutes",
          "relation": "can_read"
        }
      },
      {
        "id": "privileged-memo",
        "type": "document",
        "title": "Attorney-Client Communication",
        "file": "context/privileged-memo.pdf",
        "access": {
          "type": "fga",
          "object": "document:privileged-memo",
          "relation": "can_read"
        }
      }
    ]
  }
}
```

### 3.3 Access Types

| Type | Behavior |
|------|----------|
| `public` | All recipients with access to the tez can see this item |
| `authenticated` | Any authenticated user in the tenant can see this item |
| `fga` | Access is determined by a fine-grained authorization check |
| `creator_only` | Only the tez creator can see this item during interrogation |

When no `access` field is present on a context item, the default access type
is `public` (consistent with TIP v1.0 behavior where all context items are
available to all recipients).

### 3.4 FGA Check Semantics

When `access.type` is `fga`, the implementation MUST perform an authorization
check before including the item in the retrieval index for a given recipient.

The check takes the form:

```
Check(user: <recipient_identifier>, relation: <access.relation>, object: <access.object>)
```

Implementations MUST support the following authorization systems or provide
an adapter interface:

| System | `access.type` value | Description |
|--------|---------------------|-------------|
| OpenFGA | `fga` | Google Zanzibar-style relationship-based access control |
| OPA | `opa` | Open Policy Agent policy evaluation |
| Cedar | `cedar` | AWS Cedar policy language |
| Custom | `custom` | Implementation-defined authorization |

For `custom` access types, the `access` object MUST include a `provider`
field identifying the authorization system:

```json
{
  "access": {
    "type": "custom",
    "provider": "com.acme.internal-authz",
    "policy": "document-access",
    "attributes": {
      "classification": "confidential",
      "department": "legal"
    }
  }
}
```

### 3.5 Personalized Grounding Boundaries

When FGA-scoped access is in effect, different recipients interrogating the
same tez will have different grounding boundaries. The implementation MUST:

1. **Filter before retrieval**: Exclude unauthorized context items from the
   retrieval index before executing the query. Implementations MUST NOT
   retrieve chunks from unauthorized items and then filter post-retrieval,
   as this may leak information through retrieval scoring side-channels.

2. **Scope citations**: Response citations MUST only reference items the
   recipient is authorized to access. If the model generates a citation to
   an unauthorized item, the implementation MUST remove or redact that
   citation before delivering the response.

3. **Disclose scope**: The response MUST indicate the recipient's accessible
   context scope (see Section 3.6).

### 3.6 Context Scope Disclosure

When FGA-scoped access is in effect, the implementation MUST include a
`context_scope` field in the `tip.response.end` event and in any synchronous
response envelope. This field informs the recipient of the boundaries of
their grounding:

```json
{
  "context_scope": {
    "total_items": 12,
    "accessible_items": 8,
    "accessible_item_ids": [
      "public-filing",
      "market-data",
      "competitor-analysis",
      "revenue-model",
      "cost-structure",
      "team-roster",
      "project-timeline",
      "risk-register"
    ],
    "restricted_items": 4,
    "scope_complete": false
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `total_items` | integer | REQUIRED | Total items in the tez bundle |
| `accessible_items` | integer | REQUIRED | Items accessible to this recipient |
| `accessible_item_ids` | array | RECOMMENDED | IDs of accessible items |
| `restricted_items` | integer | REQUIRED | Items the recipient cannot access |
| `scope_complete` | boolean | REQUIRED | `true` if all items are accessible |

When `scope_complete` is `false`, the implementation SHOULD include a notice
in the response indicating that the answer is based on a subset of the
available context:

> "This response is based on 8 of 12 context items in this tez. Additional
> context items exist that you do not have access to. The completeness of
> this response may be affected."

### 3.7 Authorization Caching

FGA checks are performed per-recipient, per-item. For tez bundles with many
context items, this can produce a high volume of authorization checks.

Implementations SHOULD cache authorization results with the following
constraints:

- Cache TTL MUST NOT exceed 300 seconds (5 minutes)
- Cache MUST be keyed on `(recipient_id, relation, object_id)`
- Cache MUST be invalidated when the underlying authorization model changes
- Cache invalidation MUST propagate within 10 seconds of the model change

Implementations SHOULD use batch authorization checks where the underlying
system supports them (e.g., OpenFGA batch check, up to 50 checks per
request).

### 3.8 FGA Integration with Retrieval

When FGA-scoped access is active, the retrieval pipeline MUST adapt:

1. **Pre-filter**: Build a set of accessible item IDs for the recipient
   before retrieval begins.
2. **Scoped index**: If the implementation uses tenant-scoped embedding
   indices (Section 6), filter the index query to only include accessible
   items.
3. **Over-fetch**: Because filtering reduces the candidate set,
   implementations SHOULD retrieve `top_k * 3` candidates before filtering,
   then return the top `top_k` authorized results.
4. **Audit**: Log which items were filtered and why, for compliance purposes.

---

## 4. Retrieval Transparency

### 4.1 Overview

TIP v1.0 treats RAG retrieval as a black box. The response includes citations,
but no information about how those citations were found. Enterprise consumers
-- compliance officers, auditors, quality engineers, and debugging operators
-- need visibility into the retrieval process.

Retrieval transparency is OPTIONAL. Implementations MAY omit retrieval
metadata entirely and remain TIP-compliant. When provided, retrieval metadata
MUST conform to the schema defined in this section.

### 4.2 Citation Retrieval Metadata

Each citation in an interrogation response MAY include a `retrieval` object
with the following fields:

```json
{
  "item_id": "financial-model",
  "location": "Sheet2:B12",
  "verified": true,
  "retrieval": {
    "method": "hybrid",
    "vector_score": 0.89,
    "keyword_score": 0.72,
    "hybrid_score": 0.83,
    "rank": 1,
    "chunk_id": "chunk_0042",
    "chunk_tokens": 412,
    "reranked": true,
    "rerank_score": 0.91
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | REQUIRED | Retrieval method: `vector`, `keyword`, `hybrid` |
| `vector_score` | number | OPTIONAL | Vector similarity score (0.0-1.0) |
| `keyword_score` | number | OPTIONAL | Keyword/BM25 relevance score (0.0-1.0) |
| `hybrid_score` | number | OPTIONAL | Combined hybrid score (0.0-1.0) |
| `rank` | integer | OPTIONAL | Position in retrieval results (1-indexed) |
| `chunk_id` | string | OPTIONAL | Internal chunk identifier for audit trail |
| `chunk_tokens` | integer | OPTIONAL | Token count of the retrieved chunk |
| `reranked` | boolean | OPTIONAL | Whether re-ranking was applied |
| `rerank_score` | number | OPTIONAL | Score after re-ranking (0.0-1.0) |

### 4.3 Retrieval Methods

| Method | Description |
|--------|-------------|
| `vector` | Dense vector similarity search (embedding-based) |
| `keyword` | Sparse keyword search (BM25 or similar) |
| `hybrid` | Combination of vector and keyword with weighted fusion |

Implementations using other retrieval methods SHOULD use the closest standard
method name and MAY include additional detail in the `chunk_id` or in
extension fields.

### 4.4 Score Normalization

All scores MUST be normalized to the range [0.0, 1.0] where 1.0 represents
a perfect match. Implementations MUST document their normalization approach
if scores from different retrieval systems are combined.

### 4.5 Audit Trail

When retrieval transparency is enabled, implementations SHOULD persist
retrieval metadata for audit purposes. The retention period SHOULD be
configurable and SHOULD default to 90 days.

Retrieval metadata MUST be included in the interrogation log (per TIP
Section on session management) when available.

---

## 5. Multi-Pass Retrieval Strategies

### 5.1 Overview

TIP v1.0 Section 10 describes RAG requirements with an implicit single-pass
retrieval model: one query produces one retrieval, which informs one response.
Enterprise interrogation queries frequently span multiple topics, reference
multiple context items, or require comparative analysis.

This section defines retrieval strategy hints that clients MAY include in
query requests, and the corresponding implementation requirements.

### 5.2 Strategy Definitions

#### 5.2.1 single_pass (Default)

Standard single-query retrieval as described in TIP v1.0.

- The user query is used directly as the retrieval query.
- One retrieval pass is executed.
- Results are ranked and the top-k chunks are used for generation.

This is the default when no `retrieval_strategy` is specified.

#### 5.2.2 multi_pass

Query decomposition with parallel retrieval and result fusion.

The implementation MUST:

1. **Decompose** the user query into two or more sub-queries, each targeting
   a distinct aspect of the original question.
2. **Retrieve** results for each sub-query independently and in parallel.
3. **Merge** results from all sub-queries, removing duplicates.
4. **Re-rank** the merged result set by relevance to the original query.
5. **Generate** the response using the re-ranked merged results.

Example decomposition for "Compare the financial projections in the
spreadsheet with the claims in the executive memo":

- Sub-query 1: "Financial projections spreadsheet revenue growth estimates"
- Sub-query 2: "Executive memo claims about financial performance"
- Sub-query 3: "Discrepancies between projected and claimed figures"

The implementation SHOULD include decomposition metadata in the retrieval
transparency output when both features are enabled.

#### 5.2.3 exhaustive

Search all context items without retrieval filtering.

- All chunks from all accessible context items are included in the
  generation context.
- No retrieval scoring or ranking is performed.
- This strategy is appropriate for small tez bundles where the total context
  fits within the model's context window.

Implementations MUST reject `exhaustive` requests when the total context
exceeds the model's context window. The rejection MUST use the
`tip.error` event with code `CONTEXT_TOO_LARGE`.

#### 5.2.4 iterative

Multi-round retrieval where results from one pass inform the next.

The implementation MUST:

1. Execute an initial retrieval pass using the user query.
2. Analyze retrieved results to identify gaps or follow-up queries.
3. Execute one or more additional retrieval passes targeting identified gaps.
4. Merge all results and generate the response.

The maximum number of iterations SHOULD be configurable and MUST NOT exceed 5
to prevent unbounded resource consumption.

#### 5.2.5 Cost and Latency Guidance for Retrieval Strategies

The choice of retrieval strategy has significant implications for latency,
token consumption, and cost. Implementations SHOULD consider the following
guidance when selecting or recommending strategies:

| Strategy | Expected Latency | Token Budget Multiplier | Use Case |
|----------|-----------------|----------------------|----------|
| `single_pass` | 100-500ms | 1x | Simple queries, small context |
| `multi_pass` | 500ms-2s | 2-3x | Complex queries needing query reformulation |
| `iterative` | 2-10s | 3-10x | Exhaustive research, comprehensive answers |
| `exhaustive` | 5-30s | 5-20x | Audit, compliance, complete context coverage |

**Enforcement Ceilings for `iterative` Strategy**

The `iterative` strategy carries the highest risk of unbounded resource
consumption. To prevent runaway iteration, implementations MUST enforce
at least one of the following ceilings and SHOULD enforce all three:

1. **Maximum iteration count**: The maximum number of retrieval rounds.
   This is implementation-defined; RECOMMENDED maximum of 5.

2. **Maximum total retrieval time**: The maximum wall-clock time spent on
   all retrieval passes combined. RECOMMENDED 10 seconds.

3. **Maximum chunks evaluated**: The maximum number of chunks retrieved
   across all iterations combined. RECOMMENDED 500.

When any ceiling is reached, the implementation MUST stop iterating and
generate the response using results collected so far. Results MUST include
`retrieval_budget_exhausted: true` in the retrieval transparency metadata
(Section 4) to signal that the retrieval was curtailed:

```json
{
  "retrieval_summary": {
    "strategy": "iterative",
    "iterations_completed": 5,
    "chunks_evaluated": 487,
    "retrieval_time_ms": 9200,
    "retrieval_budget_exhausted": true,
    "ceiling_reached": "max_iterations"
  }
}
```

The `ceiling_reached` field SHOULD indicate which ceiling triggered
termination. When multiple ceilings are reached simultaneously, the
implementation SHOULD report the first one reached.

### 5.3 Query Schema Extension

The TIP query schema is extended with an optional `retrieval_strategy` field:

```json
{
  "query": "Compare the financial projections with the executive memo claims",
  "retrieval_strategy": "multi_pass",
  "retrieval_options": {
    "max_sub_queries": 5,
    "max_iterations": 3,
    "min_chunk_score": 0.5
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `retrieval_strategy` | string | OPTIONAL | One of: `single_pass`, `multi_pass`, `exhaustive`, `iterative`. Default: `single_pass` |
| `retrieval_options` | object | OPTIONAL | Strategy-specific configuration |

**retrieval_options fields:**

| Field | Type | Applies To | Description |
|-------|------|------------|-------------|
| `max_sub_queries` | integer | `multi_pass` | Maximum number of sub-queries. Default: 5 |
| `max_iterations` | integer | `iterative` | Maximum retrieval rounds. Default: 3 |
| `min_chunk_score` | number | All | Minimum retrieval score to include a chunk. Default: 0.0 |
| `top_k` | integer | All | Maximum chunks to use for generation. Default: 10 |

### 5.4 Strategy Selection Guidance

Implementations MAY override the client-requested strategy when operational
constraints require it. When overriding, the implementation MUST indicate the
actual strategy used in the `tip.retrieval.start` event.

| Context Size | Query Complexity | Recommended Strategy |
|-------------|------------------|----------------------|
| < 32K tokens | Any | `exhaustive` |
| 32K - 256K tokens | Simple | `single_pass` |
| 32K - 256K tokens | Multi-topic | `multi_pass` |
| > 256K tokens | Simple | `single_pass` |
| > 256K tokens | Multi-topic | `multi_pass` |
| > 256K tokens | Comprehensive analysis | `iterative` |

---

## 6. Multi-Tenant Isolation

### 6.1 Overview

Enterprise TIP implementations serve multiple organizations (tenants) on
shared infrastructure. TIP v1.0 does not address tenant boundaries. This
section defines requirements for tenant isolation in multi-tenant
interrogation platforms.

### 6.2 Tenant-Scoped Embedding Indices

Implementations serving multiple tenants MUST maintain logical separation of
embedding indices between tenants. Two approaches are acceptable:

#### 6.2.1 Physical Isolation (RECOMMENDED)

Each tenant has a dedicated vector store index (or collection/namespace):

```
tenant:acme-corp  ->  index: acme-corp-embeddings
tenant:beta-inc   ->  index: beta-inc-embeddings
```

Physical isolation provides the strongest guarantees against cross-tenant
data leakage and is RECOMMENDED for deployments handling sensitive data.

#### 6.2.2 Logical Isolation

A shared vector store index with tenant-scoped metadata filtering:

```json
{
  "vector": [0.12, 0.34, ...],
  "metadata": {
    "tenant_id": "acme-corp",
    "document_id": "doc-001",
    "tez_id": "acme-analysis"
  }
}
```

Every retrieval query MUST include a tenant filter. Implementations using
logical isolation MUST ensure that no retrieval query can return results
from another tenant, even in error conditions.

### 6.3 Cross-Tenant Tez Sharing

When a tez is shared across organizational boundaries (e.g., Acme Corp shares
a tez with their law firm), the following rules apply:

1. **Context items remain in the source tenant's storage.** The receiving
   tenant does not get a copy unless explicitly exported.

2. **Interrogation uses the sharing model defined by TIP v1.0 Section 9.8**
   (sender-hosted, recipient-hosted, or dual-mode).

3. **Embedding indices are NOT shared.** When the recipient interrogates a
   cross-tenant tez via sender-hosted mode, retrieval executes against the
   sender's embedding index. When the recipient downloads and imports the
   tez, a new embedding index is created in the recipient's tenant scope.

4. **Audit logs are partitioned by tenant.** Both the sending and receiving
   tenants MUST maintain audit records of cross-tenant interrogation
   activity.

#### 6.3.1 Cross-Tenant Availability Handling

When context items are shared across tenant boundaries, the availability
of those items becomes a dependency consideration. If the source tenant's
storage is unavailable, the receiving tenant's interrogation may be
impacted. Implementations MUST select one of the following strategies
for cross-tenant context availability:

1. **Accept dependency** (default for intra-platform sharing):
   Context items remain in the source tenant's storage. Availability of
   those items depends on the source tenant's SLA. This is the simplest
   implementation: no data duplication, no synchronization. The receiving
   tenant's interrogation will fail or degrade if the source tenant's
   storage is unavailable.

2. **Snapshot replication at share time** (RECOMMENDED for cross-platform
   and export scenarios):
   Context items are copied to the receiving tenant's storage at the time
   the tez is shared. This eliminates the cross-tenant availability
   dependency entirely. The receiving tenant holds a point-in-time snapshot
   and is not affected by source tenant outages. This strategy is
   RECOMMENDED for cross-platform tez sharing where the source and
   receiving tenants may be on different infrastructure.

3. **Replicated with sync** (for living documents):
   An initial snapshot is created at share time, with periodic
   synchronization to maintain freshness. This approach balances
   availability (the receiving tenant has a local copy) with currency
   (updates from the source propagate). Implementations using this
   strategy MUST define conflict resolution semantics for concurrent
   modifications and SHOULD document the synchronization interval
   and staleness guarantees.

**RECOMMENDED defaults:**

- **Intra-platform sharing** (source and recipient on the same platform):
  Strategy 1 (accept dependency). The platform's own SLA covers both
  tenants.

- **Cross-platform sharing** (source and recipient on different platforms
  or when exporting a tez): Strategy 2 (snapshot replication at share
  time). Cross-platform availability cannot be guaranteed by a single
  platform's SLA.

Implementations MUST document which strategy is used for each sharing
scenario. The strategy in effect SHOULD be included in the tez share
metadata so that recipients are aware of the availability model.

### 6.4 Tenant-Level Rate Limiting

Rate limiting in multi-tenant deployments operates at multiple levels.
Implementations MUST enforce limits at each level independently:

| Level | Scope | Purpose |
|-------|-------|---------|
| Per-session | Single interrogation session | Prevent runaway queries |
| Per-user | Individual user across all sessions | Fair usage per person |
| Per-tez | Single tez across all users | Protect against viral tez overwhelming resources |
| Per-tenant | Organization across all users and tezzes | Enforce contractual limits |
| Global | Entire platform | Protect infrastructure |

Limits at narrower scopes MUST NOT exceed limits at wider scopes. For
example, per-user limits MUST be less than or equal to per-tenant limits.

When a rate limit is reached, the implementation MUST emit a `tip.error`
event with code `RATE_LIMITED` and MUST include the scope of the limit in
the error message:

```json
{
  "code": "RATE_LIMITED",
  "message": "Tenant rate limit exceeded: 1000 queries/hour",
  "scope": "tenant",
  "retry_after_seconds": 120
}
```

### 6.5 Cost Attribution

Multi-tenant implementations MUST attribute interrogation costs to the
appropriate tenant. Cost records MUST include:

```json
{
  "tenant_id": "acme-corp",
  "tez_id": "acme-analysis-2026-01",
  "session_id": "sess_abc123",
  "user_id": "user:jane",
  "model": "claude-sonnet-4",
  "prompt_tokens": 12400,
  "completion_tokens": 850,
  "embedding_tokens": 0,
  "estimated_cost_usd": 0.042,
  "hosting_mode": "sender",
  "billed_to_tenant": "acme-corp",
  "timestamp": "2026-02-05T14:30:05Z"
}
```

When using sender-hosted interrogation for cross-tenant shares, costs MUST
be attributed to the sending tenant (the tenant providing compute).

### 6.6 Audit Log Partitioning

Audit logs for interrogation activity MUST be partitioned by tenant.
Each tenant MUST be able to export their audit logs without seeing
any data from other tenants.

Audit records for cross-tenant interrogation MUST appear in both tenants'
logs: the sending tenant sees "Tez X was interrogated by external recipient
Y" and the receiving tenant sees "User Y interrogated external Tez X from
tenant Z."

---

## 7. High-Throughput Interrogation

### 7.1 Overview

Enterprise deployments handle hundreds of concurrent interrogation sessions
across thousands of tez bundles. This section defines operational guidance
for implementations targeting high-throughput environments.

This section is non-normative. Implementations MAY adopt any subset of these
recommendations.

### 7.2 Connection Pooling

Interrogation sessions maintain state (context index, session history,
authorization cache). Implementations SHOULD pool connections to underlying
services:

- **Model API connections**: Maintain a connection pool to the LLM provider.
  Pool size SHOULD be tuned to the expected concurrent session count.
- **Vector store connections**: Maintain persistent connections to the vector
  store. Avoid per-query connection establishment.
- **Authorization service connections**: Maintain persistent gRPC or HTTP/2
  connections to the authorization service (OpenFGA, OPA, etc.).

### 7.3 Embedding Cache Strategies

Computing embeddings for context items is expensive. Implementations SHOULD
cache embeddings using one of the following strategies:

| Strategy | Behavior | Tradeoff |
|----------|----------|----------|
| **Pre-embed on publish** | Compute and store embeddings when a tez is published | Higher publish latency, zero interrogation-time embedding cost |
| **Embed on first interrogate** | Compute embeddings on first interrogation, cache for subsequent queries | First-query latency spike, amortized cost |
| **Lazy per-item** | Embed individual items as they are retrieved | Lowest upfront cost, per-query embedding overhead |

Pre-embed on publish is RECOMMENDED for tez bundles that will be interrogated
more than once. Implementations MUST invalidate cached embeddings when the
underlying context item changes (e.g., linked source sync).

### 7.4 Pre-Computed Chunk Indices

For tez bundles that are interrogated frequently (e.g., a company FAQ tez
shared with all customers), implementations SHOULD maintain pre-computed
chunk indices:

- Chunks are pre-extracted and stored alongside the tez bundle.
- Embeddings are pre-computed and indexed.
- The retrieval index is kept warm in memory or in a fast-access cache.

Implementations MAY use access frequency metrics to automatically promote
tez bundles to pre-computed status.

### 7.5 Session Affinity

When running multiple interrogation service instances, implementations SHOULD
route repeated queries from the same session to the same instance. This
enables:

- Context index reuse (avoid re-indexing per query)
- Authorization cache locality
- Conversation history locality

Session affinity MAY be implemented via consistent hashing on the session ID,
sticky sessions at the load balancer, or an explicit session-to-instance
mapping in a coordination store (Redis, etcd).

### 7.6 Backpressure Handling

When the interrogation service approaches capacity, implementations MUST
choose a backpressure strategy:

| Strategy | Behavior | When to Use |
|----------|----------|-------------|
| **Queue** | Accept the request and queue it for processing | When latency tolerance is high |
| **Reject** | Return HTTP 503 with `Retry-After` header | When SLA requires fast failure |
| **Degrade** | Accept but use a faster/cheaper model or strategy | When availability trumps quality |

Implementations MUST NOT silently drop requests. When a request cannot be
processed, the client MUST receive an explicit signal (HTTP 503, `tip.error`
event, or queue position notification).

### 7.7 Rate Limiting Hierarchy

The rate limiting hierarchy defined in Section 6.4 SHOULD be enforced using
a token bucket or sliding window algorithm. Rate limit state SHOULD be stored
in a shared, low-latency store (Redis, Memcached) to ensure consistency
across multiple service instances.

Rate limit headers SHOULD be included in HTTP responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1738771200
X-RateLimit-Scope: tenant
```

---

## 8. Interrogation Quality Evaluation

### 8.1 Overview

TIP v1.0 defines what a good interrogation response looks like (grounded,
cited, classified) but provides no guidance on measuring interrogation quality
over time, across models, or across tez bundles. Enterprise deployments need
standardized quality metrics for compliance, model selection, and continuous
improvement.

This section defines the `tezit-eval` extension for interrogation quality
evaluation.

### 8.2 Extension Registration

The `tezit-eval` extension uses the reserved extension ID `tezit-eval` per
Tezit Protocol v1.0 Section 8.3.

```json
{
  "extensions": {
    "tezit-eval": {
      "version": "1.0",
      "metrics": { ... },
      "thresholds": { ... },
      "history": [ ... ]
    }
  }
}
```

### 8.3 Quality Metrics

The following metrics are defined for interrogation quality evaluation:

#### 8.3.1 relevance

**Definition**: The proportion of retrieved chunks that are relevant to the
user's query.

**Range**: 0.0 - 1.0

**Measurement**: For each chunk used in response generation, a relevance
judgment is applied (binary: relevant/not-relevant, or graded: 0-3). The
metric is computed as:

```
relevance = (relevant_chunks) / (total_chunks_used)
```

Implementations MAY use automated relevance judges (a separate LLM call)
or human evaluation.

#### 8.3.2 faithfulness

**Definition**: The proportion of claims in the response that are faithfully
supported by the retrieved context.

**Range**: 0.0 - 1.0

**Measurement**: Each factual claim in the response is verified against the
cited context. The metric is computed as:

```
faithfulness = (supported_claims) / (total_claims)
```

A claim is "supported" if the cited context contains information that
directly supports the claim. Inferences and extrapolations are not
considered supported unless the response explicitly marks them as inferred
(per TIP response classification).

#### 8.3.3 citation_accuracy

**Definition**: The proportion of citations that correctly reference content
in the cited context item at the cited location.

**Range**: 0.0 - 1.0

**Measurement**:

```
citation_accuracy = (verified_citations) / (total_citations)
```

A citation is "verified" if:
- The cited item ID exists in the tez bundle
- The cited location exists within that item
- The text at the cited location supports the claim associated with the
  citation

#### 8.3.4 completeness

**Definition**: The proportion of relevant context items that were used in
the response, relative to all items that should have been used.

**Range**: 0.0 - 1.0

**Measurement**: Requires a ground-truth annotation of which context items
are relevant to a given query. Computed as:

```
completeness = (relevant_items_cited) / (total_relevant_items)
```

This metric is most useful when evaluated against benchmark query sets with
known-relevant items.

#### 8.3.5 abstention_rate

**Definition**: The proportion of queries where the system correctly abstained
(refused to answer because the context did not contain sufficient information).

**Range**: 0.0 - 1.0

**Measurement**: Requires a benchmark set that includes queries where
abstention is the correct response. Computed as:

```
abstention_rate = (correct_abstentions) / (total_abstention_appropriate_queries)
```

Both false abstentions (abstaining when the answer is in the context) and
false answers (answering when abstention is correct) are failures.

### 8.4 Metric Reporting Schema

```json
{
  "extensions": {
    "tezit-eval": {
      "version": "1.0",
      "metrics": {
        "relevance": 0.92,
        "faithfulness": 0.97,
        "citation_accuracy": 1.0,
        "completeness": 0.85,
        "abstention_rate": 0.90
      },
      "evaluated_at": "2026-02-05T10:00:00Z",
      "evaluator": "ragu-eval-api/v1.2",
      "model_evaluated": "claude-sonnet-4",
      "query_count": 50,
      "methodology": "automated_llm_judge"
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | REQUIRED | Version of the tezit-eval extension |
| `metrics` | object | REQUIRED | Quality metric values |
| `evaluated_at` | string | REQUIRED | ISO 8601 timestamp of evaluation |
| `evaluator` | string | RECOMMENDED | Identifier of the evaluation system |
| `model_evaluated` | string | OPTIONAL | Model that was evaluated |
| `query_count` | integer | RECOMMENDED | Number of queries in the evaluation set |
| `methodology` | string | RECOMMENDED | Evaluation methodology used |

### 8.5 Evaluation Methodologies

| Methodology | Description | Accuracy | Cost |
|-------------|-------------|----------|------|
| `automated_llm_judge` | A separate LLM evaluates response quality | Medium | Low |
| `automated_heuristic` | Rule-based evaluation (citation verification, format checks) | Low-Medium | Very low |
| `human_evaluation` | Human annotators evaluate response quality | High | High |
| `human_in_the_loop` | Automated evaluation with human review of edge cases | High | Medium |

Implementations MUST document which methodology was used. Results from
different methodologies SHOULD NOT be directly compared.

### 8.6 Quality Thresholds for Compliance

Implementations claiming TIP Enterprise compliance SHOULD meet the following
minimum quality thresholds:

| Metric | Minimum Threshold | Notes |
|--------|-------------------|-------|
| `citation_accuracy` | >= 0.95 | Citations must be verifiable |
| `faithfulness` | >= 0.90 | Claims must be supported by context |
| `relevance` | >= 0.80 | Retrieved chunks should be relevant |
| `completeness` | >= 0.70 | Most relevant items should be used |
| `abstention_rate` | >= 0.80 | System should abstain when appropriate |

These thresholds are RECOMMENDED, not REQUIRED. Implementations MUST publish
their actual metrics regardless of whether they meet these thresholds.

### 8.7 Per-Tez Quality Tracking

Implementations SHOULD track quality metrics per tez over time to detect
quality degradation:

```json
{
  "extensions": {
    "tezit-eval": {
      "version": "1.0",
      "history": [
        {
          "evaluated_at": "2026-01-15T10:00:00Z",
          "model": "claude-sonnet-4",
          "metrics": {
            "relevance": 0.94,
            "faithfulness": 0.98,
            "citation_accuracy": 1.0,
            "completeness": 0.88,
            "abstention_rate": 0.92
          },
          "query_count": 50
        },
        {
          "evaluated_at": "2026-02-01T10:00:00Z",
          "model": "claude-sonnet-4",
          "metrics": {
            "relevance": 0.89,
            "faithfulness": 0.95,
            "citation_accuracy": 0.98,
            "completeness": 0.82,
            "abstention_rate": 0.88
          },
          "query_count": 50
        }
      ]
    }
  }
}
```

Quality degradation (a metric dropping below its threshold or declining
by more than 10% between evaluations) SHOULD trigger an alert to the tez
owner.

### 8.8 Per-Model Quality Comparison

When an implementation supports multiple models for interrogation,
`tezit-eval` SHOULD be used to compare model quality on the same tez
and query set:

```json
{
  "extensions": {
    "tezit-eval": {
      "version": "1.0",
      "model_comparison": [
        {
          "model": "claude-sonnet-4",
          "metrics": { "relevance": 0.92, "faithfulness": 0.97, "citation_accuracy": 1.0 }
        },
        {
          "model": "gpt-4o",
          "metrics": { "relevance": 0.88, "faithfulness": 0.94, "citation_accuracy": 0.96 }
        },
        {
          "model": "gemini-2.0-pro",
          "metrics": { "relevance": 0.90, "faithfulness": 0.95, "citation_accuracy": 0.97 }
        }
      ],
      "evaluated_at": "2026-02-05T10:00:00Z",
      "query_count": 50,
      "methodology": "automated_llm_judge"
    }
  }
}
```

---

## 9. Conformance

### 9.1 Enterprise Addendum Conformance Levels

This addendum defines independent conformance claims. An implementation MAY
claim conformance to any subset of the following:

| Claim | Sections | Description |
|-------|----------|-------------|
| **TIP-Enterprise-Streaming** | Section 2 | Streaming interrogation via SSE |
| **TIP-Enterprise-FGA** | Section 3 | Fine-grained per-item access control |
| **TIP-Enterprise-Transparency** | Section 4 | Retrieval transparency metadata |
| **TIP-Enterprise-MultiPass** | Section 5 | Multi-pass retrieval strategies |
| **TIP-Enterprise-MultiTenant** | Section 6 | Multi-tenant isolation |
| **TIP-Enterprise-Scale** | Section 7 | High-throughput operational guidance |
| **TIP-Enterprise-Eval** | Section 8 | Interrogation quality evaluation |

### 9.2 Full Enterprise Conformance

An implementation claiming **TIP-Enterprise** (full enterprise conformance)
MUST implement all of the following:

- TIP-Enterprise-Streaming
- TIP-Enterprise-FGA
- TIP-Enterprise-Transparency
- TIP-Enterprise-MultiTenant

And SHOULD implement:

- TIP-Enterprise-MultiPass
- TIP-Enterprise-Scale
- TIP-Enterprise-Eval

### 9.3 Conformance Validation

Conformance validation for this addendum extends the TIP conformance test
suite (per TIP v1.0 Section on compliance testing) with additional test
categories:

| Test Category | Tests | Validates |
|---------------|-------|-----------|
| Streaming event ordering | 8 tests | Section 2.4 event ordering requirements |
| Streaming citation verification | 5 tests | Section 2.3.6 mid-stream citation |
| FGA item filtering | 10 tests | Section 3.5 personalized grounding |
| FGA scope disclosure | 4 tests | Section 3.6 context scope metadata |
| Retrieval metadata format | 6 tests | Section 4.2 schema validation |
| Multi-pass decomposition | 5 tests | Section 5.2.2 query decomposition |
| Tenant isolation | 8 tests | Section 6.2 index isolation |
| Cross-tenant sharing | 6 tests | Section 6.3 sharing rules |
| Rate limiting | 5 tests | Section 6.4 multi-level limits |
| Eval metric schema | 4 tests | Section 8.4 reporting format |

The conformance test suite will be published at:
[github.com/tezit-protocol/spec/tests/enterprise](https://github.com/tezit-protocol/spec/tests/enterprise)

---

## 10. Security Considerations

### 10.1 FGA-Scoped Retrieval and Information Leakage

Implementations of FGA-scoped interrogation (Section 3) MUST be careful to
prevent information leakage through side channels:

- **Retrieval scoring**: If unauthorized items are retrieved and then filtered,
  their presence may affect the scores of authorized items (e.g., through
  re-ranking). Implementations MUST filter unauthorized items BEFORE
  retrieval, not after.

- **Response content**: The model MUST NOT reference or allude to the existence
  of unauthorized context items. System prompts MUST instruct the model that
  only the provided (filtered) context exists.

- **Error messages**: Error messages MUST NOT reveal the IDs or titles of
  unauthorized context items.

- **Timing attacks**: Implementations SHOULD ensure that the response time
  does not vary significantly based on the number of unauthorized items
  filtered, to prevent inference about the existence of restricted content.

### 10.2 Multi-Tenant Data Isolation

Cross-tenant data leakage is the most critical security risk in multi-tenant
TIP implementations. Implementations MUST:

- Use parameterized queries with tenant ID filters on all vector store
  operations. Never construct tenant filters via string concatenation.
- Log and alert on any query that returns results from a non-matching
  tenant (defense in depth).
- Conduct periodic audits verifying that no cross-tenant data exists in
  each tenant's index.

### 10.3 Streaming Connection Security

SSE connections for streaming interrogation:

- MUST use TLS 1.2 or higher
- MUST authenticate the recipient before establishing the stream
- MUST validate that the recipient has interrogation permission on the tez
- SHOULD implement idle timeout (close connections with no activity for
  more than 300 seconds)
- MUST NOT cache SSE responses at any intermediary (enforced via
  `Cache-Control: no-cache` header)

### 10.4 Retrieval Metadata Sensitivity

Retrieval transparency metadata (Section 4) may reveal information about
the implementation's retrieval infrastructure (index names, chunk IDs,
scoring algorithms). Implementations SHOULD:

- Offer retrieval transparency as an opt-in feature per tenant
- Allow tenants to configure which retrieval fields are exposed
- Never include internal infrastructure identifiers (server names, IP
  addresses, index paths) in retrieval metadata

### 10.5 Quality Metric Manipulation

`tezit-eval` metrics (Section 8) could be manipulated by an implementation
to appear higher than actual quality. Consumers of quality metrics SHOULD:

- Verify that the evaluation methodology is documented
- Prefer metrics from independent evaluators over self-reported metrics
- Compare metrics across multiple evaluation runs and query sets
- Use the `methodology` field to weight trust appropriately

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.1-draft | 2026-02-05 | Added Section 5.2.5 with cost and latency guidance for retrieval strategies, including three enforcement ceilings for the iterative strategy (maximum iterations, time, and chunks) with `retrieval_budget_exhausted` transparency signal. Added Section 6.3.1 with cross-tenant availability handling defining three strategies (accept dependency, snapshot replication, replicated with sync) and recommended defaults. |
| 1.0-draft | 2026-02-05 | Initial draft for review |

---

## Appendix A: Complete Streaming Session Example

The following shows a complete streaming interrogation session with all event
types. Line breaks within `data` values are for readability; actual SSE events
MUST have the JSON on a single line.

```
event: tip.session.start
data: {"tez_id":"acme-analysis-2026-01","session_id":"sess_7f3a9b","model":"claude-sonnet-4","context_item_count":5,"timestamp":"2026-02-05T14:30:00.000Z"}

event: tip.context.loaded
data: {"item_count":5,"total_tokens":24800,"indexed_items":["client-specs","sow-template","codebase-analysis","cost-model","timeline"],"timestamp":"2026-02-05T14:30:01.200Z"}

event: tip.retrieval.start
data: {"query":"What drives the 6-week timeline?","strategy":"single_pass","timestamp":"2026-02-05T14:30:01.500Z"}

event: tip.token
data: {"delta":"The 6-week timeline is driven by "}

event: tip.token
data: {"delta":"three sequential integration "}

event: tip.token
data: {"delta":"requirements:\n\n1. **Legacy auth adapter** (2 weeks) - "}

event: tip.citation
data: {"item_id":"client-specs","location":"p12","text_excerpt":"Custom SAML 2.0 implementation with non-standard attribute mappings requiring adapter development","verified":true,"citation_index":1,"retrieval":{"method":"hybrid","vector_score":0.91,"keyword_score":0.78,"hybrid_score":0.87,"rank":1,"chunk_tokens":385,"reranked":true,"rerank_score":0.93},"timestamp":"2026-02-05T14:30:02.100Z"}

event: tip.token
data: {"delta":"The client uses a custom SAML implementation "}

event: tip.token
data: {"delta":"[[client-specs:p12]].\n\n2. **Data migration** (2 weeks) - "}

event: tip.citation
data: {"item_id":"client-specs","location":"p23","text_excerpt":"340,000 CRM records requiring validation and incremental migration","verified":true,"citation_index":2,"retrieval":{"method":"hybrid","vector_score":0.88,"keyword_score":0.82,"hybrid_score":0.86,"rank":2,"chunk_tokens":290,"reranked":true,"rerank_score":0.89},"timestamp":"2026-02-05T14:30:02.800Z"}

event: tip.token
data: {"delta":"340K CRM records require validation [[client-specs:p23]].\n\n"}

event: tip.token
data: {"delta":"3. **Security review** (2 weeks) - "}

event: tip.citation
data: {"item_id":"client-specs","location":"p47","text_excerpt":"InfoSec policy mandates two-week penetration testing window before production deployment","verified":true,"citation_index":3,"retrieval":{"method":"hybrid","vector_score":0.85,"keyword_score":0.90,"hybrid_score":0.87,"rank":3,"chunk_tokens":210,"reranked":true,"rerank_score":0.88},"timestamp":"2026-02-05T14:30:03.200Z"}

event: tip.token
data: {"delta":"Penetration testing window [[client-specs:p47]]."}

event: tip.response.end
data: {"classification":"grounded","confidence":"high","citation_count":3,"tokens_used":{"prompt":8200,"completion":340,"total":8540},"retrieval_summary":{"chunks_retrieved":12,"chunks_used":5,"items_referenced":1},"timestamp":"2026-02-05T14:30:03.500Z"}
```

## Appendix B: FGA Access Control Integration Examples

### B.1 OpenFGA Integration

```json
{
  "context": {
    "items": [
      {
        "id": "public-filing",
        "title": "2025 Annual Report",
        "access": {
          "type": "fga",
          "object": "document:public-filing",
          "relation": "can_read"
        }
      }
    ]
  }
}
```

Authorization check:
```
POST /stores/{store_id}/check
{
  "tuple_key": {
    "user": "user:jane@lawfirm.com",
    "relation": "can_read",
    "object": "document:public-filing"
  }
}
```

### B.2 OPA Integration

```json
{
  "context": {
    "items": [
      {
        "id": "privileged-memo",
        "title": "Attorney-Client Communication",
        "access": {
          "type": "opa",
          "policy": "tez/item_access",
          "input": {
            "item_classification": "privileged",
            "department": "legal"
          }
        }
      }
    ]
  }
}
```

### B.3 Public Access (No Authorization Check)

```json
{
  "context": {
    "items": [
      {
        "id": "press-release",
        "title": "Q4 Earnings Press Release",
        "access": {
          "type": "public"
        }
      }
    ]
  }
}
```

## Appendix C: JSON Schema Definitions

Full JSON schemas for this addendum will be published at:

- `tezit.com/spec/v1/enterprise/streaming-events.schema.json`
- `tezit.com/spec/v1/enterprise/fga-access.schema.json`
- `tezit.com/spec/v1/enterprise/retrieval-metadata.schema.json`
- `tezit.com/spec/v1/enterprise/tezit-eval.schema.json`

## Appendix D: Acknowledgments

This addendum was developed by the Ragu Platform team based on production
experience building and operating an enterprise AI orchestration platform
with TIP-compliant interrogation across multiple organizations.

The patterns described herein were refined through real deployment across
11 microservices, 29+ packages, OpenFGA fine-grained authorization,
hybrid vector+keyword retrieval (OpenSearch), multi-model support
(Anthropic, OpenAI, AWS Bedrock), and production AWS infrastructure.

---

*This document is a contribution to the Tezit Protocol from the Ragu Platform
team. It is submitted for review and potential inclusion in the Tezit Protocol
specification repository.*

*Licensed under CC BY 4.0.*
