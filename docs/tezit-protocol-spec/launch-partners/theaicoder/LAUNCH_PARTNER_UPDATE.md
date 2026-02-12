# Tezit Launch Partner Update (TheAICoder)

Date: 2026-02-06

## Executive Summary

TheAICoderV2 is implementing Tezit Protocol v1.2 by making **Tez bundles** the canonical, portable artifact for AI coding work. We currently support:

- Tez bundle storage in Postgres
- Session-to-Tez export (`.tez` archive)
- TIP Lite interrogation (context-only answering, mandatory citations, abstention)
- Interrogation session persistence + SSE streaming
- Platform discovery via `/.well-known/tezit.json`

We are not yet claiming full Tezit HTTP API conformance (e.g. `/api/v1/tez` CRUD, forking/versioning, full share/import semantics). That is queued in follow-ups below.

---

## What We’ve Implemented (Code References)

### 1) Tez Bundle Data Model (DB)

- Schema: `src/lib/db/schema/tezit.ts`
- Tables:
  - `tez_bundles`
  - `tez_context_items`
  - `tez_interrogation_sessions`
  - `tez_interrogation_queries`
  - `tez_shares`

### 2) Manifest + Types (Tezit v1.2)

- Types: `src/lib/tezit/types.ts`
- Manifest creation + Zod validation: `src/lib/tezit/manifest.ts`

### 3) Tez URI Support

- Parse/build/resolve `tez://...`: `src/lib/tezit/uri.ts`

### 4) TIP Lite Interrogation

- TIP prompt construction + citation parsing + classification + validation:
  - `src/lib/tezit/interrogation.ts`
- TIP Lite pipeline (context loaded into prompt; no retrieval):
  - `src/lib/services/interrogation-service.ts`

### 5) Session -> Tez Export and `.tez` Download

- Export service + packaging as ZIP (`.tez`): `src/lib/services/tezit-service.ts`
- Export endpoints:
  - `POST /api/sessions/{sessionId}/export`: `src/app/api/sessions/[id]/export/route.ts`
  - `GET /api/sessions/{sessionId}/export/download`: `src/app/api/sessions/[id]/export/download/route.ts`

### 6) Interrogation Endpoints

- `POST /api/tez/{bundleId}/interrogate`: `src/app/api/tez/[id]/interrogate/route.ts`
- `POST /api/tez/{bundleId}/interrogate/stream` (SSE): `src/app/api/tez/[id]/interrogate/stream/route.ts`
- Session management:
  - `GET /api/tez/{bundleId}/interrogate/sessions`
  - `GET /api/tez/{bundleId}/interrogate/sessions/{sessionId}`
  - `DELETE /api/tez/{bundleId}/interrogate/sessions/{sessionId}`

### 7) Discovery Document

- `/.well-known/tezit.json`: `public/.well-known/tezit.json`

---

## How We’re Using Tezit (Product Integration)

- **Code Review Profile**: AI coding sessions export as `code_review` Tez bundles with context items representing prompts, AI responses, code changes, terminal output, and errors.
- **TIP**: Anyone with access to the bundle can interrogate it with grounding + citations, enabling community trust and auditability.
- **Artifacts as evidence**: Tez bundles are designed to become evidence attachments for proposals/votes/imports/marketplace listings as those features ship.

---

## Known Gaps / Follow-Ups (Near-Term)

P0 (alignment + correctness) - DONE:
- Canonical `tez://` URIs (host from `NEXT_PUBLIC_APP_URL`, owner from username)
- Context item ID consistency (`ctx-000` everywhere)
- Share link consumption page: `GET /tez/share/{token}` (public, view-only)
- Honest `/.well-known/tezit.json` (truthful capability flags; `api_base` points to current partner endpoints)

P1 (interoperability):
- Add a Tezit-compatible API surface under `/api/v1/tez/*` (CRUD + context listing/download + interrogation) as a compatibility layer.
- Add `.tez` import MVP for export/import round-tripping.

P2 (protocol depth):
- Forking + lineage tree endpoints
- Versioning semantics + diff endpoints
- Extensions (facts/relationships/signing)
- TIP Enterprise event taxonomy + retrieval transparency

---

## Questions For Tezit (So We Implement the Right Way)

1. Do you expect launch partners to implement the full `/api/v1/tez/*` surface immediately, or is a staged rollout (discovery + `.tez` export + TIP Lite first) acceptable?
2. Is there a preferred convention for **context item IDs** inside bundles?
   - UUIDs are machine-friendly; human slugs are readable. We can support both via stable mapping.
3. For `.tez` archives, do you require a specific context file naming convention (e.g. `context/{item_id}.md`), or is an index-based naming acceptable if the manifest is correct?
4. Do you want strict adherence to the TIP Enterprise SSE event type naming (e.g. `tip.session.start`, `tip.token`, `tip.citation`), or is a partner-defined event schema acceptable initially?
