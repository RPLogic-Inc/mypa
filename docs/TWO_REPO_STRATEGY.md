# Two-Repo Strategy: MyPA + Tezit

**Decision:** Go with Option C (Long-Term Steward Model)
**Date:** 2026-02-08

---

## The Vision

### MyPA.chat = "OpenClaw Made Easy"
**Repo:** `mypa` (current `mypa` repo)
**Audience:** End users who want AI assistant without setup pain
**Value Prop:** One-click OpenClaw + team communication
**Revenue:** Freemium SaaS ($8/user/month Pro tier)
**Status:** Nearly complete, deploying this week

### Tezit Protocol = Open Infrastructure
**Repo:** `tezit-protocol` (to be created)
**Audience:** Developers, self-hosters, other AI platforms
**Value Prop:** Open protocol for AI-assisted team communication
**Revenue:** Hosting service + enterprise support
**Status:** Extract from MyPA next week

---

## Why Two Repos?

### Separation of Concerns

**Product vs Platform:**
```
MyPA.chat (Product)
├── Beautiful UI
├── OpenClaw bundled
├── PA Workspace (email/calendar)
├── Commercial support
└── Uses Tezit Protocol

Tezit Protocol (Platform)
├── Open specification
├── Reference server (open source)
├── Federation protocol
├── Self-hostable
└── Powers MyPA + others
```

### Different Audiences

**MyPA Users:**
- Want it to "just work"
- Don't care about protocol details
- Pay for convenience
- Need support

**Tezit Users:**
- Want to self-host
- Care about open standards
- Developer-focused
- DIY mindset

### Network Effects

**MyPA Benefits:**
- Tezit adoption → more potential MyPA users
- Self-hosters validate the protocol
- Protocol becomes standard → MyPA wins as best implementation

**Tezit Benefits:**
- MyPA is flagship instance (like Gmail for email)
- MyPA drives protocol adoption
- MyPA's commercial success funds protocol development

---

## What Each Repo Contains

### `mypa` Repo (Current Focus)

**Purpose:** Commercial product - "OpenClaw made easy"

**Contains:**
```
frontend/                   # MyPA UI
backend/
  ├── routes/
  │   ├── auth.ts          # MyPA authentication
  │   ├── users.ts         # User management
  │   ├── onboarding.ts    # Onboarding flow
  │   ├── settings.ts      # MyPA settings
  │   ├── pa.ts            # OpenClaw integration
  │   └── openclawProxy.ts # Authenticated proxy
  ├── services/
  │   ├── openclaw.ts      # OpenClaw integration
  │   └── notifications.ts # ntfy.sh push
  └── db/
      └── schema.ts        # MyPA-specific tables
pa-workspace/              # Google Workspace integration
skills/                    # OpenClaw skills
deploy/                    # MyPA deployment
```

**Uses:** `@tezit/client` npm package (after extraction)

**Unique Features:**
- ✅ OpenClaw bundled and configured
- ✅ Beautiful out-of-the-box UI
- ✅ PA Workspace (email/calendar/voice)
- ✅ Commercial support and SLA
- ✅ Hosted service with free tier

**Revenue Model:**
- Free: 5 users, 1GB storage
- Pro: $8/user/month
- Enterprise: Custom pricing

---

### `tezit-protocol` Repo (To Be Created)

**Purpose:** Open protocol + reference implementation

**Contains:**
```
PROTOCOL.md                # Formal specification
spec/                      # JSON schemas, examples
server/                    # Reference implementation
  ├── src/
  │   ├── routes/
  │   │   ├── tez.ts       # Tez CRUD
  │   │   ├── team.ts      # Team management
  │   │   ├── search.ts    # Library search
  │   │   └── federation.ts # Server-to-server
  │   ├── services/
  │   │   ├── tezProtocol.ts    # Export/import
  │   │   ├── classification.ts  # Self/dm/broadcast
  │   │   └── federation.ts      # Federated sharing
  │   └── db/
  │       ├── schema.ts     # Core Tezit tables
  │       └── fts.ts        # Full-text search
  └── docker/               # Self-hosting
clients/                   # Official SDKs
  ├── typescript/
  ├── python/
  └── go/
docs/                      # Protocol documentation
```

**Core Features:**
- ✅ Tez data model (messages + context)
- ✅ Team management
- ✅ Library/search (FTS5)
- ✅ Tezit Protocol (export/import/interrogate)
- ✅ Federation (server-to-server)
- ✅ Pluggable auth (bring your own)

**NOT Included:**
- ❌ OpenClaw integration (that's MyPA's value)
- ❌ PA Workspace
- ❌ Specific UI implementation
- ❌ Commercial features

**License:**
- Protocol spec: MIT (public domain)
- Server code: AGPL (open source, copyleft)
- Client libraries: MIT (developer-friendly)

---

## How They Work Together

### MyPA Uses Tezit as Library

```typescript
// In MyPA backend
import { TezitClient } from '@tezit/client';

const tezit = new TezitClient({
  serverUrl: process.env.TEZIT_SERVER || 'http://localhost:3002',
  authToken: mypaBackendToken
});

// MyPA routes use Tezit client
app.post('/api/cards/personal', async (req, res) => {
  const tez = await tezit.createTez({
    content: req.body.content,
    recipientType: 'self',
    userId: req.user.id
  });

  // MyPA adds OpenClaw context
  if (req.body.openclawContext) {
    await openclawService.linkToTez(tez.id, req.body.openclawContext);
  }

  res.json({ tez });
});
```

### Federation Example

```
Alice (mypa.chat) shares Tez with Bob (company.tezit.chat)
                          ↓
MyPA server calls Tezit Protocol API
                          ↓
Tezit Protocol federates to company.tezit.chat
                          ↓
Bob sees Alice's shared Tez in his self-hosted instance
```

---

## Development Workflow

### Current Phase: Finish MyPA
1. Deploy boundary hardening
2. Test end-to-end
3. Verify OpenClaw integration
4. Tag v1.0

### Next Phase: Extract Tezit
1. Create tezit-protocol repo
2. Write PROTOCOL.md
3. Extract core code
4. Add federation layer
5. Publish npm packages

### Final Phase: MyPA on Tezit
1. Update MyPA to use @tezit/client
2. Deploy MyPA as Tezit flagship
3. Test federation
4. Launch both products

---

## Timeline

```
Week 1 (Now):        Finish MyPA v1.0
                     ├── Deploy boundary hardening
                     ├── Test end-to-end
                     └── Document current state

Week 2:              Tezit Protocol Spec
                     ├── Write PROTOCOL.md
                     ├── Create JSON schemas
                     └── Design federation API

Week 3:              Tezit Reference Server
                     ├── Extract core code
                     ├── Add federation
                     └── Docker packaging

Week 4:              Client Libraries
                     ├── TypeScript client
                     ├── Python client (optional)
                     └── npm publish

Week 5:              MyPA Migration
                     ├── Use @tezit/client
                     ├── Deploy flagship instance
                     └── Test federation

Week 6:              Launch
                     ├── Publish protocol
                     ├── Open source server
                     └── Announce both products
```

---

## Marketing Positioning

### MyPA.chat Messaging

**Headline:** "Your OpenClaw Assistant, Ready in 5 Minutes"

**Features:**
- ✨ OpenClaw bundled (no setup)
- 💬 Team communication built-in
- 📧 Email/calendar/voice integration
- 🔍 Searchable team knowledge base
- 🛡️ Secure + private by design

**CTA:** "Start Free" → 5-user free tier

---

### Tezit Protocol Messaging

**Headline:** "Open Protocol for AI-Assisted Teams"

**Features:**
- 🌐 Federated (like email, not Slack)
- 🔓 Open source (MIT + AGPL)
- 🚀 Self-hostable (Docker one-liner)
- 🔌 Bring your own AI (OpenClaw, Claude, ChatGPT)
- 📖 Full protocol spec published

**CTA:** "Read the Spec" → Developer docs

---

## Success Metrics

### MyPA Success
- 1,000 users in 3 months
- 100 paying customers ($800/month revenue)
- 90%+ user satisfaction (NPS > 50)
- OpenClaw adoption increased

### Tezit Success
- Protocol spec published
- 10 self-hosted instances
- 3 third-party implementations
- Developer community formed
- Federation working between 5+ servers

---

## Monetization Architecture (Safe by Design)

This strategy turns your stated value ("safe even from us") into a commercial advantage.

### Revenue lines (without data exploitation)
1. Hosted convenience (`tezit.chat`): fast onboarding, managed upgrades, built-in reliability.
2. Business controls: SSO, policy packs, audit exports, retention controls.
3. Enterprise service: dedicated environments, compliance posture, SLA + support.

### What we never monetize
- Selling team communication data
- Ad targeting from Tez content
- Hidden training on private Tez streams

### Why this is defensible
- Buyers of AI communication tools prioritize trust and control.
- Open protocol + self-host option removes lock-in fear and speeds enterprise adoption.
- Flagship hosted instance wins on convenience and ecosystem gravity.

---

## Tier Design and Conversion Path

| Stage | User State | Product Trigger | Commercial Outcome |
|---|---|---|---|
| Explore | 1-5 member team | First useful shared Tez + replies | Free retention |
| Adopt | 6-25 member team | Admin pain: limits, governance, reliability | Pro conversion |
| Standardize | 25-200 member org | Need SSO/audit/policy controls | Business conversion |
| Govern | 200+ enterprise | Legal/compliance/SLA requirements | Enterprise contract |

Operational rule:
- Keep free tier generous enough for network effects.
- Make paid tiers about reliability/governance/scale, not artificial lockouts.

---

## Federation and Governance Model

### Protocol governance
- Public protocol roadmap and change proposals.
- Versioned compatibility policy (`v1.x` backward compatibility target).
- Security response policy with coordinated disclosure process.

### Ecosystem stewardship
- Maintain official SDKs and reference server.
- Certify compatible implementations (optional conformance badge).
- Keep MyPA as flagship implementation, not sole implementation.

---

## 12-Month Operating Plan

### Quarter 1
- Ship hosted flagship with safe boundary hardening complete.
- Publish protocol draft + reference test fixtures.
- Launch with Free + Pro packaging.

### Quarter 2
- Add Business tier controls (SSO, policy packs, audit export API).
- Stand up first third-party federated pilot.
- Publish security whitepaper and trust commitments.

### Quarter 3
- Enterprise deployment templates (single-tenant + private cloud).
- Compliance workstream (SOC2 readiness controls).
- Expand partner integrations for share/search workflows.

### Quarter 4
- Multi-region reliability improvements and formal SLAs.
- Protocol v1.1 update based on production interoperability data.
- Expand ecosystem adoption targets.

---

## Updated Success Metrics (Business + Trust)

- Free-to-paid conversion by team size cohort
- 90-day paid retention
- Time-to-first-team-value (< 24 hours to first useful thread)
- Interop success rate across federated servers
- Security incidents causing cross-team exposure: zero
- Enterprise sales cycle length and win rate

---

## Open Questions

1. **Naming:**
   - Keep "MyPA.chat" or rename?
   - "Tezit" vs "Tez Protocol" vs something else?
   - **Current:** MyPA = product, Tezit = protocol

2. **Ownership:**
   - Same GitHub org or separate?
   - **Recommendation:** Same org (yourorg/mypa + yourorg/tezit-protocol)

3. **Governance:**
   - Who controls protocol evolution?
   - **Recommendation:** You maintain spec, community can propose changes

4. **Business Structure:**
   - One company or two?
   - **Recommendation:** One company, two products (like GitLab)

5. **Timeline:**
   - Extract Tezit before or after MyPA v1.0?
   - **Decision:** After MyPA stable (this week)

---

## Next Steps

**Today:**
1. ✅ Commit remaining changes in mypa repo
2. ✅ Review TWO_REPO_STRATEGY.md (this doc)
3. ✅ Decide: Deploy MyPA from feature branch or merge to main first?

**This Week:**
1. Deploy MyPA v1.0 (follow MYPA_COMPLETION_CHECKLIST.md)
2. Test end-to-end
3. Tag release

**Next Week:**
1. Create tezit-protocol repo
2. Write PROTOCOL.md
3. Begin extraction (follow TEZIT_EXTRACTION_PLAN.md)
4. Finalize packaging + trust commitments (follow TEZIT_SAFE_MONETIZATION_BLUEPRINT.md)

---

**Questions?**
- Deploy now or review code first?
- Deploy from feature branch or merge to main?
- Any concerns about the two-repo strategy?
