# Tezit Protocol — MyPA Contribution Offer

**From:** MyPA.chat (Launch Partner)
**Date:** February 9, 2026
**Status:** Production (6+ months, 800+ automated tests, 4 services)
**Repo:** [github.com/ragurob/MyPA.chat](https://github.com/ragurob/MyPA.chat) (monorepo)

---

## Summary

MyPA is a production Tezit Protocol implementer with 6+ months of deployment experience across four services (API backend, messaging relay, Google Workspace integration, and Canvas UI). We've recently consolidated into a single monorepo and are ready to contribute reference implementations, new spec proposals, and interoperability testing to the Tezit ecosystem.

This document outlines what we can contribute, what we propose for the protocol, and how we can help other launch partners.

---

## 1. New Spec Proposal: Public TIP Endpoints

### The Problem

The Tezit Protocol defines how context is bundled (portable `.tez` archives), transmitted (HTTP API), and interrogated (TIP). What it does not define is how a Tez reaches someone who does not have a Tezit-compatible system.

In practice, most recipients today are on WhatsApp, iMessage, Telegram, Slack, or email. They will not install a new application to read a message. The protocol needs a way to deliver Tez value over existing communication channels.

### The Proposal

Every Tez should be able to generate a **shareable interrogation link** — a URL that grants scoped, read-only access to that specific Tez's context and TIP capabilities.

```
https://mypa.chat/tez/abc123?token=eyJhbGciOiJIUzI1NiJ9...
```

**What the link provides:**
- Surface text of the Tez (human-readable summary)
- TIP interrogation interface (ask questions, receive cited answers)
- Context layer browsing (background, facts, artifacts, constraints)
- Read-only access scoped to that single Tez
- AI resources provided by the sender's system (not the recipient's)

**What the link does NOT provide:**
- Access to any other Tez
- Write access of any kind
- Sender identity or authentication details
- Access to the sender's Library or other resources

**Transport agnostic.** The link can travel over any channel:

| Channel | Delivery |
|---------|----------|
| Email | Surface text in body, TIP link in footer, `.tez.json` as attachment |
| WhatsApp / iMessage | Surface text + TIP link |
| Telegram / Slack | Surface text + TIP link (optionally with unfurl preview) |
| SMS | Abbreviated surface + TIP link |
| QR code | Printed on slide decks, posters, business cards |
| Native Tez (PA-to-PA) | Full context iceberg, no lossy mirroring needed |

**Proposed spec location:** `/docs/transport/public-tip.md`

**Proposed endpoint conventions:**

```
# Generate a shareable TIP link
POST /api/v1/tez/{id}/share
Request:  { "expiresIn": "7d", "maxInterrogations": 100 }
Response: { "url": "https://host/tez/{id}?token=...", "expiresAt": "..." }

# Public TIP interrogation (no JWT required, token-scoped)
POST /api/v1/tez/{id}/interrogate?token={shareToken}
Request:  { "question": "What was the rationale for this decision?" }
Response: { "answer": "...", "citations": [...], "classification": "grounded" }

# Public Tez surface (no JWT required, token-scoped)
GET /api/v1/tez/{id}?token={shareToken}
Response: { "surfaceText": "...", "contextLayers": [...], "metadata": {...} }
```

**Security model:**
- Share tokens are cryptographically signed (JWT or HMAC)
- Scoped to a single Tez ID (cannot enumerate or access others)
- Time-limited (default 7 days, configurable)
- Rate-limited (per-token and per-IP)
- Interrogation count capped (prevents abuse of sender's AI resources)
- Revocable by sender

**Why this matters for adoption:**
The public TIP link makes Tez viral without requiring recipient adoption. A consultant sends a Tez to a client via email — the client clicks the link and interrogates the full context without installing anything. The value of the protocol is experienced immediately. When the recipient wants to send their own Tez back, that is when they adopt the protocol.

### Implementation Status

We are building this now. Reference implementation will be available at:
- Backend route: `backend/src/routes/tez.ts`
- Token generation: `backend/src/services/tezOps.ts`
- Rate limiting: `backend/src/middleware/rateLimit.ts`

---

## 2. Reference Implementations Available

The following are production-tested implementations we can contribute as reference code or spec documentation.

### 2a. Tez Discovery Protocol

**Spec gap:** The protocol defines transmission and interrogation but not discovery — how users find relevant tezits at scale.

**Our implementation:**
- SQLite FTS5 full-text search with Porter stemming and BM25 ranking
- Engagement scoring: `interrogations x5 + citations x4 + responses x3 + mirrors x2 + reactions x1`
- Browse mode: trending (7-day, engagement-ranked) + recent (30-day, chronological)
- Sub-10ms p99 latency at 100K+ entries
- Snippet highlighting with `<mark>` tags

**Reference files:**
- FTS5 virtual table management: `backend/src/db/fts.ts`
- Search API: `backend/src/routes/library.ts`
- 7 integration tests covering search, browse, facets

**Proposed spec location:** `/docs/discovery/`

Full proposal: [PROTOCOL_PROPOSALS.md, Proposal #1](./PROTOCOL_PROPOSALS.md)

### 2b. Fork Semantics (4 Types)

**Spec gap:** Forking is referenced but fork types and their effect on TIP are not specified.

**Our implementation:**

| Fork Type | Semantic | TIP Behavior |
|-----------|----------|-------------|
| `counter` | Disagrees with parent | Weight both equally, note contradiction |
| `extension` | Builds on parent | Combine contexts, child augments parent |
| `reframe` | Same topic, different lens | Present both, let user choose framing |
| `update` | Supersedes parent | Prefer child, note parent is outdated |

**Reference files:**
- Fork API: `POST /api/tez/:id/fork` in `backend/src/routes/tez.ts`
- Fork types in schema: `backend/src/db/schema.ts`
- Tests: `backend/src/__tests__/tez.test.ts`

**Proposed spec location:** Extension to Section 7 (Forking & Lineage)

Full proposal: [PROTOCOL_PROPOSALS.md, Proposal #4](./PROTOCOL_PROPOSALS.md)

### 2c. Email Transport

**Spec gap:** The protocol defines HTTP transport and `.tez.json` bundles but no email transport specification.

**Our implementation:**
- Outbound: Multipart email with surface text in body, `.tez.json` as attachment, `X-Tezit-Protocol: 1.2` and `X-Tezit-ID` headers
- Inbound detection: `X-Tezit-Protocol` header OR `.tez.json` attachment OR `tezit_version:` marker in body
- Each PA has a real Google Workspace email address (domain-wide delegation)
- Cross-organization Tez exchange via standard email infrastructure (SPF, DKIM, encryption)

**Reference files:**
- Email transport service: `pa-workspace/src/services/tezEmail.ts`
- Transport API: `pa-workspace/src/routes/tez-transport.ts`
- Gmail integration: `pa-workspace/src/services/googleGmail.ts`
- Tests: `pa-workspace/tests/tez-transport.test.ts`, `pa-workspace/tests/tez-email.test.ts`

**Proposed spec location:** `/docs/transport/email.md`

Full proposal: [PROTOCOL_PROPOSALS.md, Proposal #3](./PROTOCOL_PROPOSALS.md)

### 2d. Security Guidelines (Prompt Injection Defense)

**Spec gap:** No security guidance for TIP implementations processing potentially adversarial content.

**Our implementation:**
- Input sanitization: strip known injection patterns (`[HIDDEN]`, `[SYSTEM]`, `IGNORE PREVIOUS INSTRUCTIONS`)
- Context isolation: each Tez has isolated scope, no ambient authority
- Citation verification: traces to immutable source documents, not editable entries
- Tool result validation: system reminders prepended, suspicious patterns flagged
- Rate limiting: per-user, per-Tez, team-wide abuse detection
- Audit trail: all TIP interrogations logged with full context

**Reference files:**
- Sanitization: `backend/src/services/tezInterrogation.ts`
- Prompt security: `backend/src/services/promptSecurity.ts`
- Rate limiting: `backend/src/middleware/rateLimit.ts`
- Security tests: `backend/src/__tests__/promptSecurity.test.ts`, `backend/src/__tests__/security-boundary.test.ts`

**Proposed spec location:** `/docs/security/`

Full proposal: [PROTOCOL_PROPOSALS.md, Proposal #2](./PROTOCOL_PROPOSALS.md)

### 2e. Engagement Metadata in Portable Bundles

**Spec gap:** Interrogation and citation counts are protocol-level value signals but are lost when tezits are exported between systems.

**Proposed addition to `.tez.json`:**
```json
{
  "protocol_version": "1.3.0",
  "engagement": {
    "interrogation_count": 47,
    "citation_count": 23,
    "response_count": 12,
    "first_interrogated_at": "2025-09-15T14:22:00Z",
    "most_recent_interrogation_at": "2026-02-08T09:45:00Z"
  }
}
```

Full proposal: [PROTOCOL_PROPOSALS.md, Proposal #5](./PROTOCOL_PROPOSALS.md)

---

## 3. Responses to TheAICoder's Open Questions

TheAICoder's [LAUNCH_PARTNER_UPDATE.md](../theaicoder/LAUNCH_PARTNER_UPDATE.md) poses four implementation questions. Based on our production experience:

### Q1: Full `/api/v1/tez/*` surface immediately, or staged rollout?

**Recommendation: Staged.**

We implemented in this order:
1. Discovery (`.well-known/tezit.json`) + TIP interrogation — this is where the value is
2. Export (`.tez` download) — enables interoperability testing
3. CRUD (`GET/POST/PUT/DELETE`) — needed for full integration
4. Forking, versioning, extensions — protocol depth

The interrogation endpoint is the most valuable surface to ship first. Users experience the protocol's value through TIP before they need CRUD.

### Q2: Context item IDs — UUIDs or human slugs?

**Recommendation: UUIDs internally, slugs for display.**

We use UUIDs (`ctx-f23cdac6-...`) as canonical IDs in the database and manifest. Display names are derived from content or explicitly set. The manifest maps between them.

Both work if the manifest is the source of truth. UUIDs prevent collision across systems. Slugs are better for Level 0 (inline) tezits where human readability matters.

### Q3: `.tez` archive context file naming convention?

**Recommendation: `context/{item_id}.md` with manifest as source of truth.**

We use `context/{item_id}.md` (or `.json` for structured context). The manifest's `context_items[].path` field is authoritative — file naming is a convention for human readability, not a requirement.

If TheAICoder prefers index-based naming (`context/000-prompt.md`, `context/001-response.md`), that is valid as long as the manifest maps correctly.

### Q4: TIP Enterprise SSE event naming?

**Recommendation: Partner-defined initially, standardize at 3+ implementations.**

We currently use request/response (not SSE) for TIP interrogation. When we add streaming, we will align with whatever convention emerges from the spec.

For TheAICoder's SSE implementation, partner-defined event names are pragmatic for now. The spec should standardize event naming when there are enough implementations to identify the right abstraction. Premature standardization will constrain implementations unnecessarily.

---

## 4. Interoperability Testing

We offer the following for cross-platform testing:

### Production Endpoints

| Endpoint | URL | Auth |
|----------|-----|------|
| TIP Interrogation | `POST https://app.mypa.chat/api/tez/:id/interrogate` | JWT Bearer |
| Tez Export | `GET https://app.mypa.chat/api/tez/:id/export` | JWT Bearer |
| Tez Import | `POST https://app.mypa.chat/api/tez/import` | JWT Bearer |
| Library Search | `GET https://app.mypa.chat/api/library/search?q=...` | JWT Bearer |
| Protocol Discovery | `GET https://app.mypa.chat/.well-known/tezit.json` | None |
| Health | `GET https://app.mypa.chat/health/live` | None |

### Test Credentials

```
Email:    test@test.com
Password: testtest1
```

Available for other launch partners to test interoperability. Login via `POST https://app.mypa.chat/api/auth/login` returns JWT tokens.

### What We Can Test

1. **Import TheAICoder's `.tez` bundles** — validate our import handles their code_review profile
2. **Cross-platform TIP** — TheAICoder creates a Tez, we interrogate it (and vice versa)
3. **Discovery verification** — mutual `.well-known/tezit.json` validation
4. **Fork interoperability** — create a fork of a Tez from another system

---

## 5. Architecture Overview (for context)

```
MyPA.chat Monorepo
├── backend/        API server (Express + SQLite)     — port 3001
│                   Cards, Library FTS5, TIP, Auth, Tez Protocol
├── relay/          Messaging relay (Express + SQLite) — port 3002
│                   Teams, contacts, conversations, threading, context layers
├── pa-workspace/   Google Workspace (Express + SQLite) — port 3003
│                   PA email, calendar, drive, Tez email transport
├── canvas/         Tezit Messenger (React 19 + Vite 7)
│                   WhatsApp-style UI: teams, DMs, context viewer, threading
├── extensions/
│   └── tezit/      OpenClaw Channel Plugin (in development)
│                   Native PA-to-PA messaging as OpenClaw channel
├── skills/
│   └── mypa/       OpenClaw Skill (SKILL.md)
│                   Teaches AI agent: Library, Relay, TIP, Cards, PA context
└── docs/
    └── tezit-protocol-spec/   Full protocol spec + launch partner docs
```

**Production:**
- Server: DigitalOcean (Ubuntu 24.04), PM2 + nginx
- Domains: app.mypa.chat (API), oc.mypa.chat (OpenClaw Gateway + Canvas)
- Tests: 800+ across 4 services (backend: 544, relay: 118, pa-workspace: 138)
- AI Runtime: OpenClaw (Claude Sonnet 4.5)

---

## 6. Proposed Next Steps

1. **Spec PRs** — We will open pull requests on the tezit-protocol-spec repo for:
   - `/docs/transport/public-tip.md` (new: public TIP endpoint spec)
   - `/docs/transport/email.md` (new: email transport spec)
   - `/docs/discovery/` (new: discovery protocol with FTS5 reference)
   - `/docs/security/` (new: prompt injection defense guidelines)
   - Section 7 extension: fork type formalization
   - Portable bundle: engagement metadata field

2. **TheAICoder collaboration** — We will provide:
   - Answers to their 4 open questions (included above)
   - Reference code for fork semantics, import/export, discovery
   - Interop testing via production endpoints

3. **Public TIP implementation** — We will ship the token-scoped interrogation endpoint and contribute it as a reference implementation for the spec.

---

## Contact

**Repository:** [github.com/ragurob/MyPA.chat](https://github.com/ragurob/MyPA.chat)
**Production:** https://app.mypa.chat
**Protocol Discovery:** https://app.mypa.chat/.well-known/tezit.json

Available for discussion, code review, and interoperability testing.

---

**Document version:** 1.0
**Last updated:** February 9, 2026
**License:** CC-BY-4.0
