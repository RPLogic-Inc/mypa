# Tezit Protocol v1.3 Proposals - From MyPA Production Experience

**Submitted by:** MyPA (https://app.mypa.chat)
**Date:** February 8, 2026
**Based on:** 6+ months production deployment, 100K+ tezits, 1000+ TIP interrogations

---

## Overview

This document proposes specific enhancements to the Tezit Protocol v1.3 based on real-world production experience. Each proposal includes rationale, implementation guidance, and backward compatibility considerations.

---

## Proposal #1: Discovery Protocol Specification

**Priority:** High
**Status:** Reference implementation complete

### Problem

The Tezit Protocol defines how context is **transmitted** and **interrogated**, but not how it's **discovered**. At scale (10K+ tezits), users face:
- Intimidating empty search boxes
- No way to surface high-value content proactively
- Recency bias (newest content dominates, not most valuable)

### Proposal

Add `/docs/discovery/` to the spec with a "Tez Discovery Surface" document defining:

#### 1. Scale Thresholds

| Entry Count | Discovery Strategy |
|-------------|-------------------|
| 0-100 | Chronological list (no search needed) |
| 100-1,000 | Basic search (keyword matching sufficient) |
| 1,000-10,000 | Full-text search + ranking (FTS5 or vector) |
| 10,000+ | Browse mode + engagement scoring |

#### 2. Engagement Scoring Formula

```
engagement_score =
  interrogations × 5 +
  citations × 4 +
  responses × 3 +
  mirrors × 2 +
  reactions × 1
```

**Rationale:** Interrogations and citations are protocol-specific signals indicating proven value. They should outweigh generic social signals.

#### 3. Browse Mode Pattern

**Cold start UX:** Show trending (high engagement, last 7 days) + recent (last 30 days) content before search.

```json
{
  "endpoint": "GET /library/browse",
  "response": {
    "trending": [
      {
        "id": "tez://...",
        "summary": "...",
        "engagement_score": 47,
        "interrogation_count": 5,
        "citation_count": 4
      }
    ],
    "recent": [ ... ]
  }
}
```

#### 4. Performance Benchmarks

Reference implementations should achieve:
- p99 latency <10ms for 100K entries
- Index size <20% of content size
- Snippet highlighting in <5ms

### Backward Compatibility

- Discovery is optional (not required for conformance)
- Existing implementations continue to work
- Engagement metadata can be added incrementally

### Reference Implementation

- MyPA FTS5: `backend/src/db/fts.ts`
- Library API: `backend/src/routes/library.ts`
- Performance: Sub-10ms queries at 100K+ entries

---

## Proposal #2: Security Guidelines for TIP

**Priority:** High
**Status:** Multi-layer defense implemented

### Problem

AI agents processing tez content are vulnerable to:
1. Prompt injection via user content
2. Tool result poisoning
3. Citation manipulation

Production deployments need security guidance.

### Proposal

Add `/docs/security/` to the spec with:

#### 1. Prompt Injection Defense Checklist

**Input Sanitization:**
```typescript
function sanitizeContextForTIP(rawContext: string): string {
  return rawContext
    .replace(/\[HIDDEN.*?\]/gi, '')
    .replace(/\[SYSTEM.*?\]/gi, '')
    .replace(/---END.*?---/gi, '')
    .replace(/IGNORE (ALL )?PREVIOUS INSTRUCTIONS/gi, '')
    .trim();
}
```

**Tool Result Validation:**
- Always prepend system reminder to tool outputs
- Flag suspicious patterns (e.g., "SYSTEM:", "IGNORE PREVIOUS")
- Log potential injection attempts

**Context Isolation:**
- Each tez has isolated context scope
- Cross-tez references require explicit linking (fork, citation)
- No ambient authority

#### 2. TIP Citation Verification Requirements

**Minimum requirements:**
```typescript
interface TipCitation {
  contextItemId: string;        // Required: link to verified context
  relevantExcerpt: string;      // Required: exact text (max 500 chars)
  verificationDetails: string;  // Required: how this was verified
  confidence: "high" | "medium" | "low";  // Required

  // Optional but recommended:
  sourceDocument?: {
    filename: string;
    checksum: string;  // Verify document hasn't changed
    page?: number;
  };
}
```

**Critical:** Citations must trace to immutable source documents, not editable context entries.

#### 3. Rate Limiting Recommendations

- Per-user interrogation limit: 100/hour
- Per-tez interrogation limit: 50/hour (prevent exploit attempts)
- Team-wide abuse detection: alert on 10+ failed interrogations

#### 4. Security Headers

**Proposed new headers:**
- `X-Tezit-Content-Trust: verified|user-supplied|external`
- `X-Tezit-Citation-Verified: true|false`
- `X-Tezit-Sanitized: true|false`

### Backward Compatibility

- Security headers are optional
- Implementations without security headers remain valid
- Sanitization is recommended, not required

### Reference Implementation

- Sanitization: `backend/src/services/tezInterrogation.ts`
- Rate limiting: `backend/src/middleware/rateLimit.ts`
- Audit trail: `tez_interrogations` table

---

## Proposal #3: Email Transport Specification

**Priority:** Medium
**Status:** Implemented in MyPA PA Workspace

### Problem

Tezit Protocol defines `.tez.json` bundles but no transport beyond HTTP. Email is a natural transport for cross-organization tez sharing.

### Proposal

Add email transport specification to protocol:

#### Standard Headers

```
X-Tezit-Protocol: 1.2.4
X-Tezit-ID: tez://mypa.chat/card/abc123
Content-Type: multipart/mixed
```

#### Email Structure

```
From: alice-pa@company-a.com
To: bob-pa@company-b.com
Subject: Q4 Budget Review
X-Tezit-Protocol: 1.2.4
X-Tezit-ID: tez://mypa.chat/card/abc123

------
Part 1: Text/Plain

Budget review attached as Tezit bundle.

View with interrogation support:
https://app.mypa.chat/tez/abc123

------
Part 2: application/json; name="tez-abc123.json"

{
  "protocol_version": "1.2.4",
  "id": "tez://mypa.chat/card/abc123",
  "context": [ ... ],
  "manifest": { ... }
}
```

#### Benefits

- Cross-organization sharing (no shared infra)
- Works with existing email security (SPF, DKIM, S/MIME)
- Deep link to canonical tez for interrogation
- Attachment is standard .tez.json (no email-specific format)

#### Detection Rules

**Inbound email is a Tezit if:**
1. `X-Tezit-Protocol` header present, OR
2. Attachment with `.tez.json` extension, OR
3. Inline JSON with `"protocol_version": "1.2.x"` field

### Backward Compatibility

- Email transport is optional
- HTTP transport remains primary
- No changes to .tez.json format

### Reference Implementation

- MyPA PA Workspace: `pa-workspace/src/services/tezEmail.ts`
- Outbound: `POST /api/tez-transport/send`
- Inbound: `POST /api/email/process` (detects Tezit headers/attachments)

---

## Proposal #4: Fork Semantics Formalization

**Priority:** Medium
**Status:** Implemented with 4 fork types

### Problem

The spec mentions forking but doesn't specify fork types or how TIP should handle parent-child relationships.

### Proposal

Define fork taxonomy in the spec:

#### Fork Types

```typescript
type ForkType = "counter" | "extension" | "reframe" | "update";

interface TezFork {
  forkedFromId: string;           // Parent tez ID
  forkType: ForkType;

  // Semantic relationship (for TIP)
  semanticRelation: {
    contradicts?: boolean;         // Counter
    augments?: boolean;            // Extension
    replaces?: boolean;            // Update
    recontextualizes?: boolean;    // Reframe
  };
}
```

#### Fork Type Definitions

| Type | Description | TIP Behavior |
|------|-------------|--------------|
| **counter** | Disagree with parent, propose alternative | Weight both equally, note contradiction |
| **extension** | Build on parent, add new information | Combine contexts, child augments parent |
| **reframe** | Same topic, different perspective | Present both, let user choose framing |
| **update** | Parent outdated, this supersedes it | Prefer child, note parent is superseded |

#### TIP Query Handling

**Example:** User interrogates a tez with forks.

```typescript
// Query: "What's our Q4 budget?"
// Original tez: "$2M budget approved"
// Fork (update): "$2.5M budget approved after revision"

// TIP should:
1. Detect fork relationship
2. Check fork type (update = replacement)
3. Prioritize child (fork) over parent
4. Note in response: "This supersedes previous budget of $2M"
```

### Backward Compatibility

- Fork type is optional metadata
- Implementations without fork types remain valid
- Default behavior (if no type): treat as "extension"

### Reference Implementation

- Fork types: `backend/src/db/schema.ts` (cards table)
- Fork API: `POST /api/tez/:id/fork`
- Query: `GET /api/cards/:id/forks`

---

## Proposal #5: Engagement Metadata in Portable Bundles

**Priority:** Medium
**Status:** Proposed (not yet implemented)

### Problem

Interrogation count and citation count are protocol-level signals indicating content value, but they're lost when tezits are exported/imported between systems.

### Proposal

Add optional `engagement` field to .tez.json bundles:

```json
{
  "protocol_version": "1.3.0",
  "id": "tez://mypa.chat/card/abc123",
  "created_at": "2025-09-15T10:30:00Z",

  "engagement": {
    "interrogation_count": 47,
    "citation_count": 23,
    "response_count": 12,
    "reaction_count": 5,
    "mirror_count": 3,
    "first_interrogated_at": "2025-09-15T14:22:00Z",
    "most_recent_interrogation_at": "2026-02-08T09:45:00Z"
  },

  "context": [ ... ],
  "manifest": { ... }
}
```

#### Benefits

1. **Portable value signals** - Receiving system knows this is high-value content
2. **Import ranking** - Can rank imported tezits by engagement
3. **Discovery** - Engagement-based discovery works across systems
4. **Provenance** - Track when content was first found valuable

#### Implementation Guidelines

- `engagement` is optional (not required for conformance)
- Counts are cumulative (don't reset on export)
- Importing system can choose to honor or ignore engagement data
- Timestamp fields help detect stale high-engagement content

### Backward Compatibility

- Fully backward compatible (optional field)
- v1.2.4 implementations ignore `engagement` field
- v1.3+ implementations can export without `engagement`

---

## Proposal #6: Mirror vs Canonical Distinction

**Priority:** Low
**Status:** Pattern implemented, formalization proposed

### Problem

When tezits are shared externally (Slack, email, etc.), the shared copy is a "mirror" — a lossy representation. The protocol should clarify this distinction.

### Proposal

Add `/docs/mirrors/` section to spec defining:

#### Definitions

- **Canonical tez**: The source of truth (supports TIP, full context, editable)
- **Mirror**: Lossy external share (static, no interrogation, read-only)

#### Mirror Requirements

**Every mirror MUST include:**
1. Deep link to canonical tez (`tez://` URI or HTTPS URL)
2. Visible note: "See full context: [link]"
3. Timestamp of when mirror was created
4. Clear indication it's a mirror (not canonical)

#### Example Mirror (Slack)

```markdown
📋 Budget Review Q4 2025

Department: Engineering
Total: $2.5M
Approved: Yes

---
🔗 This is a mirror. See full context with interrogation support:
https://app.mypa.chat/tez/abc123
(tez://mypa.chat/card/abc123)

Mirrored: 2026-02-08 10:30 UTC
```

#### Benefits

- Users understand mirrors can be stale
- Deep link drives users back to canonical tez for TIP
- Prevents fragmentation (single source of truth)

### Backward Compatibility

- Mirror distinction is guidance, not requirement
- Existing implementations can adopt incrementally

---

## Proposal #7: Reference Test Fixtures

**Priority:** Low
**Status:** Proposed

### Problem

Implementers lack standard test cases to validate conformance. Production bugs often result from edge cases not covered in the spec.

### Proposal

Create `/test-fixtures/` directory in spec repo with:

#### Valid Bundles

- `minimal-tez.json` - Smallest valid tez
- `full-featured-tez.json` - All optional fields populated
- `with-forks.json` - Fork relationships
- `with-interrogations.json` - TIP response examples

#### Invalid Bundles

- `missing-protocol-version.json` - Should reject
- `invalid-fork-type.json` - Should reject
- `malformed-context.json` - Should reject

#### TIP Test Cases

- `tip-query-with-citations.json` - Valid TIP response
- `tip-query-no-context.json` - Valid rejection (no relevant context)
- `tip-citation-verification.json` - Citation verification examples

### Benefits

- Implementers can validate against reference fixtures
- Reduces interoperability issues
- Documents edge cases

---

## Summary & Prioritization

| Proposal | Priority | Impact | Complexity |
|----------|----------|--------|-----------|
| #1 Discovery Protocol | High | High (every implementer will need this) | Medium |
| #2 Security Guidelines | High | Critical (prevents real vulnerabilities) | Low |
| #3 Email Transport | Medium | High (enables cross-org sharing) | Medium |
| #4 Fork Semantics | Medium | Medium (improves TIP accuracy) | Low |
| #5 Engagement Metadata | Medium | Medium (portable value signals) | Low |
| #6 Mirror Distinction | Low | Low (mostly guidance) | Low |
| #7 Reference Fixtures | Low | High (helps all implementers) | Low |

---

## Next Steps

1. **Community review** - Share proposals with protocol working group
2. **Interoperability testing** - Validate with other implementers
3. **Spec drafts** - Write formal spec language for accepted proposals
4. **Reference implementations** - MyPA code available as reference

---

## Contact

**Implementation:** MyPA (https://app.mypa.chat)
**Source code:** https://github.com/ragurob/MyPA.chat
**Discussion:** Available for protocol working group collaboration

---

**Document version:** 1.0
**Last updated:** February 8, 2026
**License:** CC-BY-4.0 (free to use with attribution)
