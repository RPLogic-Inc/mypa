# Tezit Launch Partner Follow-Ups (Implementation Backlog)

Date: 2026-02-06

This is the execution backlog for Tezit alignment and partner-grade interoperability.

## P0 (This Week): Alignment + Correctness

### F0.1 Tez Bundle Listing API (DONE)

- Outcome: Implemented `GET /api/tez` to list current user bundles.
- Code: `src/app/api/tez/route.ts`
- Acceptance: `/tez` loads and lists bundles with status/profile/context count.

### F0.2 Canonical Tez URI Host + Owner (DONE)

- Outcome:
  - `buildTezUri()` default host derives from `NEXT_PUBLIC_APP_URL` (fallback `theaicoder.com`).
  - `GET /api/tez/{id}` returns `tezUri` built as `tez://{host}/{username}/{bundleId}`.
- Code:
  - `src/lib/tezit/uri.ts`
  - `src/app/api/tez/[id]/route.ts`
- UI:
  - Tez detail page displays `data.tezUri`: `src/app/(dashboard)/tez/[id]/page.tsx`

### F0.3 Context Item ID Consistency (Manifest <-> DB <-> TIP) (DONE)

- Decision: Canonicalize to manifest-style `ctx-000` identifiers.
- Outcome:
  - Manifest context item IDs use `ctx-${ordering}`.
  - TIP citations use the same `ctx-000` IDs.
  - Offline `.tez` archive context file names include `ctx-000-...` for readability.
- Code:
  - `src/lib/services/interrogation-service.ts`
  - `src/lib/services/tezit-service.ts`
  - `src/app/api/tez/[id]/route.ts`

### F0.4 Discovery Document Honesty (DONE)

- Outcome:
  - `api_base` now points to current partner endpoints (`/api`) and capability booleans are truthful.
- Code:
  - `public/.well-known/tezit.json`

### F0.5 Share Link Consumption (DONE)

- Outcome:
  - Implement `/tez/share/{token}` that validates token, enforces access level, and renders bundle.
- Code:
  - `src/app/tez/share/[token]/page.tsx`
  - `src/middleware.ts` (public route allowlist)

### F0.6 Tez UI Uses Canonical URI (DONE)

- Outcome: Use `data.tezUri` returned by API.
- Acceptance: All displayed Tez URIs round-trip through `parseTezUri()`.

## P1 (2-3 Weeks): Minimal Spec-Compatible API Surface

### F1.1 `/api/v1/tez` Compatibility Routes

Implement minimal Tezit endpoints as aliases/wrappers:
- `POST /api/v1/tez` (create tez)
- `GET /api/v1/tez/{id}` (manifest/metadata)
- `GET /api/v1/tez/{id}/context` (list)
- `GET /api/v1/tez/{id}/context/{item_id}` (download)
- `POST /api/v1/tez/{id}/interrogate` (existing)
- `POST /api/v1/tez/{id}/interrogate/stream` (existing)

Acceptance criteria:
- A third-party client can discover us via `/.well-known/tezit.json` and call these endpoints successfully.

### F1.2 Archive Import (MVP)

- `POST /api/v1/tez/import` to accept a `.tez` upload, validate manifest schema, store bundle + items.

Acceptance criteria:
- Import round-trips: export -> import -> interrogate.

## P2 (4-8 Weeks): Deeper Protocol Support

### F2.1 Forking + Lineage

- `POST /api/v1/tez/{id}/fork`
- `GET /api/v1/tez/{id}/forks`
- `GET /api/v1/tez/{id}/lineage`

### F2.2 Versioning

- `GET /api/v1/tez/{id}/versions`
- Immutable snapshot semantics + optional diff.

### F2.3 TIP Enterprise Alignment

- Standardize SSE event types to TIP Enterprise naming (if Tezit requires strict conformance).
- Add retrieval transparency metadata when/if retrieval is introduced.

### F2.4 Extensions

- Facts extraction skeleton: `extensions/tezit-facts`
- Relationships skeleton: `extensions/tezit-relationships`
- Signing/encryption plan (even if deferred).

---

## Partner Comms Follow-Ups

- Send Tezit team:
  - `docs/tezit/LAUNCH_PARTNER_UPDATE.md`
  - `docs/tezit/CONFORMANCE_MATRIX.md`
  - A sample `.tez` file exported from a real session
- Ask for a short call to confirm:
  - required conformance level for launch
  - preferred context item ID conventions
  - SSE event taxonomy expectations
