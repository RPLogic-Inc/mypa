# Twenty CRM Integration Plan (MyPA + OpenClaw + Tezit)

Date: 2026-02-09

## Objective

Ship a default "starter pack" in MyPA/OpenClawd deployments:

- OpenClaw runtime
- PA identity (email + calendar)
- Tezit PA-to-PA communication
- Twenty CRM (default operational system)

The CRM should improve assistant execution while preserving MyPA's trust model:
least privilege, explicit sharing controls, team isolation, and auditable context flow.

## Reference Learnings Applied

Based on `https://github.com/ragurob/James-Real-Estate-Feb-26.git`:

- Keep Twenty as an independent service (Docker stack: app + Postgres + Redis).
- Connect OpenClaw/MyPA via API key (`TWENTY_API_URL`, `TWENTY_API_KEY`), not direct DB coupling.
- Model CRM operations as assistant skill actions (lead/task/search/update), then layer domain prompts.

Important: do not import or copy user CRM backup data (for example `database/twenty_crm_backup.sql`) into MyPA.

## Integration Architecture

1. Deployment
- Provision Twenty per deployment environment (dev/staging/prod), behind private network or restricted ingress.
- Keep CRM DB isolated from MyPA DB; integrate through authenticated API only.

2. Runtime wiring
- OpenClaw skill: operational CRM actions (search/create/update contacts, opportunities, tasks).
- MyPA backend: governance and context bridge (who can access what, what can be attached to Tez, audit events).

3. Config surface
- Team/instance-level env vars:
  - `TWENTY_API_URL`
  - `TWENTY_API_KEY`
- Optional next step: secret-store references instead of raw env where available.

## Tezit + CRM Context Model

Treat CRM records as structured context candidates, not as full raw dumps.

Recommended attachment types for Tez:

- `crm.contact` (id, name, role, preferred channels)
- `crm.opportunity` (stage, value band, owner, next step, close constraints)
- `crm.task` (owner, due date, status, dependency)
- `crm.activity` (timestamped interaction summary, source)

Rules:

- Attach minimum necessary fields by default.
- Allow recipient-side request for expanded context.
- Track all share/edit/redact/export actions in audit logs.
- Preserve a clear provenance pointer to CRM object IDs and timestamps.

## Implementation Phases

### Phase 1 (now)
- Add Twenty integration status and connectivity checks in MyPA settings API.
- Expose `twentyConfigured` in PA context payload for skill/runtime awareness.
- Add environment configuration examples.

Implemented in this pass:
- `/api/settings/team` now returns `twentyConfigured` and `twentyApiUrl`.
- `/api/settings/team/test-integration` now supports `integration: "twenty"`.
- New CRM adapter routes:
  - `GET /api/crm/status`
  - `GET /api/crm/workflows/status`
  - `GET /api/crm/people`
  - `POST /api/crm/people`
  - `PATCH /api/crm/people/:entityId`
  - `GET /api/crm/opportunities`
  - `POST /api/crm/opportunities`
  - `PATCH /api/crm/opportunities/:entityId`
  - `GET /api/crm/tasks`
  - `POST /api/crm/tasks`
  - `PATCH /api/crm/tasks/:entityId`
  - `GET /api/crm/:entityType/:entityId`
  - `POST /api/crm/tez-context`
  - `POST /api/crm/workflows/coordinate` (CRM + Tez + OpenClaw + optional PA Workspace execution)
- Canvas operations surface:
  - New `Operations` screen in `canvas` for CRM search/create/update and workflow coordination
  - Workflow output can be sent directly as relay Tez (`/tez/share`)
- New env vars:
  - `PA_WORKSPACE_API_URL`
  - `PA_WORKSPACE_SERVICE_TOKEN` (optional)

### Phase 2
- Add CRM adapter service in backend:
  - `searchContacts`
  - `getOpportunity`
  - `upsertTask`
  - `listUpcomingFollowUps`
- Add server-side allowlist for CRM host(s) to reduce SSRF risk.

### Phase 3
- Add Tez enrichment endpoint:
  - Input: card/tez intent + CRM object references
  - Output: sanitized context layers ready for Tez transmit
- Add policy controls for context expansion requests and redaction.

### Phase 4
- Add OpenClaw skill package for MyPA CRM operations with Tezit-native flows:
  - "Create follow-up and send Tez handoff"
  - "Summarize opportunity blockers into Tez"
  - "Generate daily CRM + Tez action briefing"

## License and Compliance Notes (Snapshot)

These are implementation constraints, not legal advice.

1. OpenClaw
- Source: `https://github.com/openclaw/openclaw`
- License: MIT
- Practical impact: bundling and commercial hosting are generally allowed with attribution and license notice retention.

2. Twenty CRM
- Sources:
  - `https://github.com/twentyhq/twenty/blob/main/LICENSE`
  - `https://twenty.com/pricing` (Licensing section)
- Practical impact:
  - Core repo is largely AGPL-style copyleft.
  - Some files are explicitly marked `/* @license Enterprise */` and governed by Twenty commercial terms/subscription.
  - If distributing modified Twenty outside your org, AGPL/commercial obligations must be checked carefully.
- Required before launch:
  - Identify whether deployed features include any Enterprise-licensed code paths.
  - Decide compliance strategy (strict OSS-only deployment and source publication obligations vs commercial agreement with Twenty).
  - Keep an auditable SBOM/dependency manifest per release.

## Immediate Next Actions

- Add granular permission policies for CRM write actions (role and team-bound object policies).
- Add route-level tests for `/api/crm/workflows/coordinate` including dry-run and execution modes.
- Add safe field allowlists per entity type to prevent accidental oversharing in Tez context layers.
