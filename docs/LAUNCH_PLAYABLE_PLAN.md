# MyPA Playable Launch Plan (Tezit Upgrades to OpenClaw)

Date: February 9, 2026
Branch target: `feat/openclaw-boundary-final`
Goal: Ship a working version that users can actually play with to validate the Tezit communication upgrade on top of OpenClaw.

## 1. Demo Outcomes We Must Prove

1. A user can create/share a Tez from live work context in 2 actions or less.
2. A recipient can open a Tez and understand likely intent in 1 action.
3. A recipient can act in 1 action (approve/challenge/ask/ack).
4. Team context is searchable and interrogatable.
5. OpenClaw runtime is available only through authenticated MyPA paths.

## 2. Scope for the Playable Cut (Must-Have)

1. Keep OpenClaw as runtime through `/api/openclaw/chat/completions`.
2. Keep MyPA as UX/context/team layer.
3. Implement Quick Share, proactive hints, and reply quick actions.
4. Add metadata-only usage events for click-budget and utility measurement.
5. Close trust gaps that violate docs (secrets policy, auditability, redaction path).

## 3. Explicitly Out of Scope for This Cut

1. Full two-repo extraction (`tezit-protocol` repo split).
2. Full billing/entitlements UI.
3. Enterprise SSO/compliance packs.
4. Federation rollout.

## 4. Execution Plan

### Phase A: Playability Blockers (Day 1-2)

1. Fix Quick Action "Send to Team" end-to-end.
   Files: `frontend/src/components/tez/TezExpanded.tsx`, `frontend/src/App.tsx`, `frontend/src/services/api.ts`.
2. Ensure PA is usable in deployed web mode (not only native bridge).
   Files: `frontend/src/services/openclawBridge.ts`, deployment env config (`VITE_OPENCLAW_GATEWAY=true` where needed).
3. Add explicit share entry points from Stream/Expanded Tez.
   Files: `frontend/src/components/stream/TezStream.tsx`, `frontend/src/components/tez/TezExpanded.tsx`.

Exit criteria:
1. Share-to-team works from Tez Expanded and Stream without TODO stubs.
2. PA chat works in deployed web app through authenticated proxy.

### Phase B: Tezit Utility Features (Day 2-4)

1. Add `shareIntent` support (`note`, `decision`, `handoff`, `question`, `update`, `escalation`) in API contract.
   Files: `backend/src/middleware/validation.ts`, `backend/src/routes/cards.ts`, `backend/src/db/schema.ts` (+ migration), `frontend/src/services/api.ts`.
2. Add proactive hints generation and storage.
   Files: `backend/src/services/classify.ts` (or new service), `backend/src/routes/cards.ts`, `backend/src/db/schema.ts` (+ migration), `frontend/src/components/cards/Card.tsx`, `frontend/src/components/tez/TezExpanded.tsx`.
3. Add one-tap quick actions (`approve`, `challenge`, `ask`, `ack`) and map to response/status behavior.
   Files: `frontend/src/components/tez/TezExpanded.tsx`, `backend/src/routes/cards.ts`.

Exit criteria:
1. Recipient sees 1-3 hints on open.
2. Recipient can perform quick action in one tap.
3. Intent type is persisted and visible in API responses.

### Phase C: Trust/Security Conformance (Day 4-5)

1. Remove `openaiApiKey` persistence from team settings for trust-contract alignment (env-only for this cut).
   Files: `backend/src/db/schema.ts`, `backend/src/routes/settings.ts`, migrations, settings UI.
2. Add immutable audit events for share/edit/redact/export actions.
   Files: `backend/src/db/schema.ts` (+ migration), relevant routes in `backend/src/routes/`.
3. Add redaction step on share path before persistence/send for obvious PII patterns.
   Files: `backend/src/services/` (new redaction utility), `backend/src/routes/cards.ts`.

Exit criteria:
1. No secrets stored in DB that violate trust doc.
2. Audit events produced for required mutating actions.
3. Redaction path test coverage is present.

### Phase D: Metrics for Real Validation (Day 5-6)

1. Add metadata-only event table and emitter (no private Tez content).
   Events: `tez_shared`, `tez_opened`, `tez_replied`, `tez_interrogated`, `team_invite_sent`, `team_invite_accepted`, `proactive_hint_clicked`.
2. Add simple internal metrics endpoint/report script.
   Files: `backend/src/routes/` (admin/internal), `deploy/` script.
3. Replace console-only UX metric logs with server-side event capture.

Exit criteria:
1. We can report click-budget and utility metrics for pilot users.
2. Event payloads are metadata-only.

### Phase E: Test, Ship, Pilot (Day 6-7)

1. Automated verification.
   Commands:
   `npm run test -w backend`
   `npm run build -w backend`
   `npm run build -w frontend`
   `npm run build:a2ui -w frontend`
2. Security boundary smoke checks.
   `bash deploy/smoke-test.sh https://app.mypa.chat`
3. Manual UAT script with 6 scenarios.
   Scenario 1: quick share
   Scenario 2: receive + proactive hint
   Scenario 3: one-tap quick action
   Scenario 4: ask PA from Tez
   Scenario 5: library retrieval
   Scenario 6: unauthorized OpenClaw access blocked

Exit criteria:
1. All automated checks pass.
2. All 6 UAT scenarios pass on production deploy.
3. No P0/P1 security findings.

## 5. Definition of "Working Version to Play With"

1. Users can send and receive Tezits with visible AI-added context upgrades.
2. OpenClaw capabilities are accessible through MyPA UX without exposing shared runtime tokens.
3. Team workflows are faster than raw OpenClaw for comms-oriented tasks.
4. We can measure utility (clicks + conversion behaviors) from real sessions.

## 6. First Three Tickets to Start Immediately

1. Implement TezExpanded "Send to Team" (remove TODO; wire to `createTeamCard`).
2. Add `shareIntent` to schema + create routes + frontend payloads.
3. Implement proactive hint rendering with initial backend-generated hints.

