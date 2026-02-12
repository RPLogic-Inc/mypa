# Tezit Conformance Matrix (TheAICoderV2)

Date: 2026-02-06

Legend: ✅ implemented, 🟡 partial, ⏳ planned, ❌ not started

## Core Bundle Format

- ✅ ZIP-based `.tez` export with `manifest.json` + `context/` + `README.md`: `src/lib/services/tezit-service.ts`
- ✅ SHA-256 hashes stored for context items: `src/lib/services/tezit-service.ts`, `src/lib/utils/hash`
- ✅ Offline archive context files named with canonical IDs (e.g. `context/ctx-000-...`): `src/lib/services/tezit-service.ts`

## Profiles

- ✅ `code_review` (primary): session exports default here
- 🟡 `knowledge` (types exist; bundle creation UI not shipped)
- 🟡 `coordination` (types exist; bundle creation UI not shipped)
- ❌ `messaging` (types exist; no profile behavior/UI)

## TIP (Tez Interrogation Protocol)

- ✅ Context-only answering (TIP Lite mode)
- ✅ Mandatory citations format `[[item-id]]` parsing + validation
- ✅ Response classification: grounded/inferred/partial/abstention
- ✅ Abstention behavior supported
- ✅ SSE streaming interrogation (partner schema)
- ❌ TIP Enterprise event taxonomy + retrieval transparency
- ❌ Multi-pass retrieval strategies (we run “full context in prompt” only)

## URI Scheme

- ✅ `tez://` parser + builder + resolver: `src/lib/tezit/uri.ts`
- ✅ Host/owner alignment
  - Builder default host derives from `NEXT_PUBLIC_APP_URL` (fallback `theaicoder.com`)
  - Tez detail UI displays canonical URI returned by API

## Discovery (`/.well-known/tezit.json`)

- ✅ Present at `public/.well-known/tezit.json`
- ✅ Fields aligned to current partner endpoints (`api_base: /api`) and truthful capability flags

## HTTP API Surface (Spec)

We currently ship **partner endpoints** under `/api/tez/*` and `/api/sessions/*`.

### Tez CRUD

- 🟡 `GET /api/v1/tez/{id}` equivalent: `GET /api/tez/{id}` returns manifest + context + shares (auth-gated to owner for now)
- ✅ Bundle listing (partner): `GET /api/tez`
- ❌ `POST /api/v1/tez` create arbitrary tez
- ❌ `PUT /api/v1/tez/{id}` update
- ❌ `DELETE /api/v1/tez/{id}` delete
- ❌ Version endpoints

### Context Management

- 🟡 Context list/download: available in bundle view via stored content, but not a public `/api/v1/tez/{id}/context` endpoint
- ❌ Upload/remove context items endpoints

### Archive build/import

- ✅ Download `.tez` for session exports: `GET /api/sessions/{id}/export/download`
- ❌ `POST /api/v1/tez/import` import archive

### Interrogation

- ✅ `POST /api/v1/tez/{id}/interrogate` equivalent: `POST /api/tez/{id}/interrogate`
- ✅ `POST /api/v1/tez/{id}/interrogate/stream` equivalent: `POST /api/tez/{id}/interrogate/stream`
- ✅ Session history endpoints exist (partner paths)

### Forking / Lineage

- ❌ Fork endpoints
- ❌ Lineage tree

### Sharing

- 🟡 Share link creation exists: `POST /api/tez/{id}/share`
- ✅ Share token consumption page: `GET /tez/share/{token}`

## Security + Governance

- 🟡 Hashes stored; signature/encryption extensions not implemented
- 🟡 Permissions modeled in manifest + DB; enforcement + scoping are still evolving
