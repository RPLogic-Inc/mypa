# Tezit Safe Monetization Blueprint (v0.1)

Date: 2026-02-08
Status: Draft
Owner: Product + GTM + Platform

## 1) Principle

Safety is not a constraint on monetization. Safety is the product advantage that makes monetization durable.

Tezit monetizes:
- managed operations
- governance and compliance controls
- reliability and support

Tezit does not monetize:
- private communication content
- behavioral ad targeting
- hidden private-data training

## 2) Business Model

### Product lines
1. Hosted service (`tezit.chat`): fastest path to value.
2. Self-host protocol server: trust and portability anchor.
3. Enterprise deployment/support: high-ACV reliability + governance offering.

### Why this compounds
- Open protocol reduces lock-in fear.
- Self-host option increases buyer confidence.
- Most teams still choose managed hosting for convenience.
- Flagship hosted instance becomes network hub for federation.

## 3) Packaging and Entitlements

| Tier | Price | Team Profile | Key Entitlements |
|---|---:|---|---|
| Free | $0 | Small teams evaluating | Up to 5 members, baseline search, standard support |
| Pro | $8/user/mo | Active teams | Unlimited team size, deeper search windows, priority support |
| Business | $18/user/mo | Org rollout | SSO, policy packs, audit APIs, higher limits |
| Enterprise | Contract | Regulated/large orgs | Dedicated deployment, SLA, compliance support |

Design rule:
- Never withhold core protocol rights behind a paywall.
- Charge for managed convenience, governance, and operational guarantees.

## 4) Trust Contract (Public)

### Technical guarantees
- Per-user auth required for all runtime routes.
- Team isolation is mandatory on every query/write.
- No shared public token injection path for AI runtime.
- OpenClaw/API secrets are environment-managed only.
- Full export portability available for all teams.

### Product guarantees
- Teams can self-host or leave with their data.
- Clear retention and deletion controls.
- Verifiable audit logs for share/edit/export actions.

## 5) Monetization Events and Metrics

### Usage events (metadata only)
- `tez_shared`
- `tez_opened`
- `tez_replied`
- `tez_interrogated`
- `invite_sent`
- `invite_accepted`
- `library_search_executed`
- `policy_rule_applied`

### North-star metrics
- Team Weekly Value: teams with >= 5 useful share/reply cycles/week.
- 7-day invite acceptance rate.
- Free-to-paid conversion by team size.
- 90-day paid retention.
- Security incident count affecting cross-team isolation (target: zero).

## 6) Conversion Triggers

| Trigger | Signal | Offer |
|---|---|---|
| Team growth | Team >5 users | Pro |
| Governance needs | Audit/export/policy features requested | Business |
| Procurement constraints | SSO/compliance/SLA requirements | Enterprise |

## 7) 12-Month Plan

### Quarter 1
- Launch hosted flagship with Free + Pro.
- Publish trust contract and architecture boundary.
- Instrument conversion and usage events.

### Quarter 2
- Ship Business tier controls (SSO, policy packs, audit export).
- Launch partner pilot with federated self-host instance.

### Quarter 3
- Offer dedicated private deployments.
- Add enterprise support workflows and uptime reporting.

### Quarter 4
- Protocol v1.1 refinements from production interoperability data.
- Expand ecosystem integrations and referral loop.

## 8) Risks and Mitigations

### Risk: Open protocol reduces revenue
Mitigation:
- Differentiate with operations quality and enterprise-grade reliability.
- Keep hosted onboarding dramatically easier than self-host.

### Risk: Privacy posture weakens growth speed
Mitigation:
- Turn trust controls into visible product features.
- Publish transparent architecture boundaries and audits.

### Risk: Feature bloat re-creates a second assistant UI
Mitigation:
- Keep Tezit focused on human-to-human comms and context flow.
- Let OpenClaw own assistant runtime/tooling UX.

## 9) Decision Checklist (Before Public Pricing)

- [ ] Entitlement model implemented and tested
- [ ] Billing events schema in place (metadata-only)
- [ ] Public trust contract published
- [ ] Team isolation and auth proxy tests green
- [ ] Data export/import verified end-to-end

## 10) Companion Docs

- Product requirements: `docs/TEZIT_COMMS_PRODUCT_SPEC.md`
- Product/platform strategy: `docs/TWO_REPO_STRATEGY.md`
- Build sequence: `docs/TEZIT_EXTRACTION_PLAN.md`
