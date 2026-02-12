# Tezit Communication Layer - Product Spec (v0.1)

Date: 2026-02-08
Status: Draft
Owner: Product + Platform

## 1) Product Thesis

OpenClaw is excellent at human-to-AI workflows. It does not natively solve AI-upgraded human-to-human communication. Tezit fills that gap.

Tezit is an AI-mediated communication layer where every message carries useful context, can be interrogated, and is preserved in a searchable team knowledge base.

## 2) Problem

Current team communication tools are context-poor and high-friction:
- Messages are short and ambiguous.
- Receivers must ask follow-up questions for missing context.
- Decisions and rationale are lost in chat scrollback.
- AI tools help individuals but do not upgrade person-to-person exchange.

## 3) Positioning

- OpenClaw: runtime for agent reasoning, tools, memory, and automation.
- Tezit: communication protocol + UX for team messaging with AI context mediation.

Tezit should not duplicate OpenClaw chat, memory UI, or tool UI.

## 4) Core Objects

### Tez
A shareable communication object.

Fields:
- `id`
- `teamId`
- `threadId`
- `senderUserId`
- `recipients[]`
- `surfaceText` (human-readable top-line message)
- `contextPackId`
- `type` (`note`, `decision`, `handoff`, `question`, `update`)
- `visibility` (`team`, `dm`, `private`)
- `createdAt`, `updatedAt`

### ContextPack
The iceberg below the message.

Fields:
- `id`
- `tezId`
- `summaryBullets[]`
- `sourceRefs[]` (message refs, docs, prior tez, calendar/email refs)
- `confidence` (0-1)
- `proactiveHints[]` (likely interpretations/options)
- `redactions[]`

### TezThread
Conversation container for a Tez.

Fields:
- `id`
- `rootTezId`
- `replyCount`
- `lastActivityAt`

### Interrogation
Q/A over the ContextPack.

Fields:
- `id`
- `tezId`
- `askerUserId`
- `question`
- `answer`
- `citations[]`
- `answeredAt`

## 5) Core User Flows

### Flow A: Quick Share (primary viral loop)
1. User is in OpenClaw working session.
2. User clicks `Share with Team`.
3. AI drafts `surfaceText` and assembles `ContextPack`.
4. User confirms recipients and sends.
5. Tez appears in Team Stream with notification badge.

Target: <= 2 actions from active work context to sent Tez.

### Flow B: Receive with proactive understanding
1. Recipient opens Team Stream item.
2. UI shows `surfaceText` plus 1-3 proactive hints (likely intent/options).
3. Recipient replies directly or taps `Ask` for deeper interrogation.

Target: recipient can understand and act in 1 tap for common cases.

### Flow C: Threaded clarification
1. Recipient chooses `Discuss` on a Tez.
2. Replies are attached to same TezThread.
3. AI keeps thread summary current and updates ContextPack.

### Flow D: Team Library retrieval
1. User searches `team library` by natural language.
2. Results return Tez + confidence-ranked context snippets.
3. User opens a Tez and sees citations/decision trail.

## 6) AI Involvement Model

Every Tez goes through one or more of these modes:
- Draft Assist: rewrite for clarity and tone.
- Context Assembly: attach relevant context automatically.
- Receiver Assist: surface likely interpretation and next steps.
- Memory Capture: index Tez + context into team library.

Rule: AI assists communication. Humans remain final senders/deciders.

## 7) Trust, Safety, and Governance

### Hard requirements
- No shared public token path to OpenClaw runtime.
- No OpenClaw secrets stored in Tezit DB.
- Authenticated per-user access for all Tezit APIs.
- Strict team scoping on every query and write.

### Communication safety
- Redaction before send for sensitive entities (secrets, PII patterns).
- Provenance labels on generated hints and summaries.
- Editable AI draft before send.
- Audit log for shares, edits, redactions, exports.

### Policy controls (team admin)
- Allowed external share domains.
- Retention rules by team.
- Feature toggles for proactive hints/interrogation.

## 8) Minimal API Surface (MVP)

- `POST /api/tez/share`
- `GET /api/tez/stream`
- `POST /api/tez/:id/reply`
- `POST /api/tez/:id/interrogate`
- `GET /api/tez/search`
- `GET /api/tez/:id`

Non-goal for MVP: full standalone assistant UI.

## 9) UX Principles

- One place to send: `Share with Team` from active OpenClaw work.
- One place to consume: Team Stream.
- One tap to understand: proactive hints visible by default.
- One tap to deepen: `Ask` for interrogation.
- Never lose rationale: all Tez and replies are searchable.

## 10) MVP Scope and Non-Goals

### In scope
- Team creation + invites
- Quick share
- Team stream + badge
- Threaded replies
- Library search
- Interrogation with citations

### Out of scope
- Rebuilding OpenClaw chat/memory/tool surfaces
- Heavy PM workflow replacement (ClickUp-class)
- Multi-org federation

## 11) Success Metrics

- Time to first Tez after install: < 60 seconds
- Invite acceptance rate (first 7 days): > 40%
- Shares per active user per week: >= 5
- Fraction of Tez opened and acted on without follow-up question: > 60%
- Zero cross-team data leakage incidents

## 12) Rollout Plan

### Phase 1: Internal alpha
- Ship Quick Share + Team Stream + basic replies
- Validate security boundary and auth model

### Phase 2: Beta teams
- Add proactive hints and interrogation
- Add library ranking improvements

### Phase 3: Distribution
- Publish as OpenClaw extension/skill experience
- Grow through invite loop and team onboarding

## 13) Open Questions

- Exact OpenClaw extension hooks available for context-menu, badges, and sidebar placement.
- Default retention policy for team library.
- Should Tez types remain minimal (`note/decision/handoff/question/update`) or be fully freeform.

## 14) User Utility Playbooks (How Teams Actually Operate)

These are the repeatable operating patterns Tezit should optimize first.

### Playbook A: Decision Broadcast
Use when a user has reached a conclusion and needs team alignment quickly.
1. `Share with Team` from OpenClaw context.
2. Tezit generates a concise decision surface + 1-3 confidence-scored rationale bullets.
3. Recipients get proactive options (`approve`, `challenge`, `ask`).
4. Thread captures all replies and becomes the durable decision record.

### Playbook B: Handoff Packet
Use when ownership moves between people or shifts.
1. Sender chooses `handoff` type.
2. ContextPack auto-includes status, blockers, owner, due window, and links.
3. Receiver sees next action in one tap, with `Ask` available for deeper context.

### Playbook C: Escalation with Provenance
Use when urgency is high and ambiguity is risky.
1. Sender marks urgency before send.
2. Tezit requires at least one evidence citation in ContextPack.
3. Escalation appears in stream with audit trail and read state.

## 15) Click Budget and UX Utility Targets

Tezit must beat raw assistant UX on team communication workflows.

- Compose and send Tez from active work context: <= 2 actions
- Open a received Tez and understand likely intent: <= 1 action
- Ask follow-up on received Tez: <= 1 action
- Locate a prior decision in team library: <= 3 actions

If these thresholds regress, release is blocked until corrected.

## 16) Safe-by-Design Monetization Model

Tezit monetizes convenience, compliance, and support. It does not monetize user content.

### Non-negotiable trust commitments
- No sale of message/context data.
- No ads based on Tez content.
- No hidden content model training from private team data.
- Data export and portability for every paid tier.
- Self-host path remains available and documented.

### Paid value that aligns with user utility
- Better operational controls (retention, audit exports, policy controls).
- Better scale (team size, storage, throughput).
- Better support and reliability (SLA, incident response, dedicated support).

## 17) Packaging and Entitlements

| Tier | Price | Who It Is For | Core Entitlements |
|---|---:|---|---|
| Free | $0 | Small teams trying Tezit | Up to 5 members, baseline search, standard retention, community support |
| Pro | $8/user/mo | Active teams using Tezit daily | Unlimited team size, deeper search/history, advanced routing controls, priority support |
| Business | $18/user/mo | Cross-functional org teams | SSO, admin policy packs, audit export API, higher limits, faster support |
| Enterprise | Contract | Security/compliance-driven orgs | Dedicated deployment options, compliance add-ons, custom retention, SLA + named support |

## 18) Billing and Product Analytics Events

These events should be implemented early so packaging decisions are data-driven.

- `tez_shared`
- `tez_opened`
- `tez_replied`
- `tez_interrogated`
- `team_invite_sent`
- `team_invite_accepted`
- `library_search_executed`
- `proactive_hint_clicked`
- `policy_rule_applied`
- `data_export_requested`

Core dashboard metrics:
- Time to first share (P50/P90)
- Invite acceptance rate (7-day and 30-day)
- Share-to-reply conversion rate
- % Tez resolved without follow-up question
- Free-to-paid conversion by team size

## 19) Security and Trust Release Gates

A release cannot ship unless:
- Cross-team access tests pass.
- No public unauthenticated route can consume OpenClaw compute.
- Secrets remain environment-managed (not persisted in app DB).
- Audit trail completeness checks pass for share/edit/redaction/export.

## 20) Companion Docs

- Monetization and trust blueprint: `docs/TEZIT_SAFE_MONETIZATION_BLUEPRINT.md`
- Product/platform split and governance: `docs/TWO_REPO_STRATEGY.md`
- Execution and extraction sequence: `docs/TEZIT_EXTRACTION_PLAN.md`
