# Tezit Protocol Extraction Plan

**When:** After MyPA.chat v1.0 is stable and tested
**Goal:** Create `tezit-protocol` repo as open infrastructure

---

## Phase 2: Extract Tezit Protocol (Next Week)

### What Is Tezit?

**Tezit** = Open protocol for AI-assisted team communication

**Core concepts:**
1. **Tez** - Message with context iceberg (summary + deep supporting content)
2. **Library of Context** - Searchable team knowledge base
3. **Tezit Protocol** - Standard for exporting/importing/interrogating Tezits
4. **Federation** - Teams on different servers can share Tezits

---

## Repo Structure

### New Repo: `tezit-protocol`

```
tezit-protocol/
├── README.md                    # "Slack for AI-assisted humans"
├── LICENSE                      # MIT for protocol, AGPL for server
├── PROTOCOL.md                  # Formal protocol specification
│
├── spec/                        # Protocol schemas
│   ├── tez-v1.schema.json       # Tez data format
│   ├── federation-v1.md         # Server-to-server protocol
│   ├── interrogation-v1.md      # TIP (Tez Interrogation Protocol)
│   └── examples/
│       ├── tez-text.json
│       ├── tez-voice.json
│       └── tez-fork.json
│
├── server/                      # Reference implementation
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── src/
│   │   ├── index.ts             # Express server
│   │   ├── config.ts            # Environment config
│   │   ├── db/
│   │   │   ├── schema.ts        # Core Tezit tables only
│   │   │   └── fts.ts           # FTS5 implementation
│   │   ├── routes/
│   │   │   ├── tez.ts           # Tez CRUD
│   │   │   ├── team.ts          # Team management
│   │   │   ├── search.ts        # Library search
│   │   │   ├── federation.ts    # Server-to-server
│   │   │   └── health.ts        # Health checks
│   │   ├── services/
│   │   │   ├── tezProtocol.ts   # Export/import/interrogate
│   │   │   ├── classification.ts # Self/dm/broadcast
│   │   │   └── federation.ts    # Federated sharing
│   │   └── middleware/
│   │       ├── auth.ts          # JWT verification (pluggable)
│   │       └── rateLimit.ts     # Rate limiting
│   ├── tests/                   # Comprehensive test suite
│   └── docker/
│       ├── Dockerfile
│       └── docker-compose.yml   # One-command self-hosting
│
├── clients/                     # Official client libraries
│   ├── typescript/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── TezitClient.ts   # REST API client
│   │   │   └── types.ts         # TypeScript types
│   │   └── README.md
│   ├── python/
│   │   ├── setup.py
│   │   └── tezit/
│   │       └── client.py
│   └── go/
│       └── tezit/
│           └── client.go
│
└── docs/
    ├── GETTING_STARTED.md       # Quick start guide
    ├── SELF_HOSTING.md          # Deploy your own server
    ├── FEDERATION.md            # How to federate
    ├── API.md                   # REST API reference
    ├── CONTRIBUTING.md          # How to contribute
    └── MANIFESTO.md             # Why we built this
```

---

## What Moves from MyPA to Tezit

### Database Schema (Core Tables Only)

**Move to tezit-protocol:**
```typescript
// Core Tezit data model
export const users = ...        // User accounts
export const teams = ...        // Team definitions
export const userTeams = ...    // Multi-team membership
export const tezits = ...       // Tez messages (renamed from cards)
export const tezContext = ...   // Library of Context
export const responses = ...    // Reply threading
export const reactions = ...    // Emoji reactions
export const tezCitations = ... // TIP citations
export const tezInterrogations = ... // TIP queries
```

**Stay in MyPA:**
```typescript
// MyPA-specific
export const teamInvites = ...     // Onboarding (MyPA feature)
export const userOnboarding = ...  // Onboarding flow
export const teamSettings = ...    // MyPA-specific settings
export const refreshTokens = ...   // MyPA auth
// (All PA Workspace tables stay in MyPA)
```

### Routes (API Endpoints)

**Move to tezit-protocol:**
- `routes/tez.ts` - Tez CRUD (renamed from cards.ts)
- `routes/team.ts` - Team management
- `routes/search.ts` - Library search (renamed from library.ts)
- `routes/federation.ts` - Server-to-server sharing (NEW)

**Stay in MyPA:**
- `routes/auth.ts` - MyPA authentication
- `routes/users.ts` - User management
- `routes/onboarding.ts` - Onboarding flow
- `routes/settings.ts` - MyPA settings
- `routes/pa.ts` - OpenClaw integration
- `routes/openclawProxy.ts` - Authenticated proxy

### Services

**Move to tezit-protocol:**
- `services/classify.ts` - Message classification
- `services/tezInterrogation.ts` - TIP implementation
- `services/tezProtocol.ts` - Export/import/fork
- `db/fts.ts` - Full-text search

**Stay in MyPA:**
- `services/openclaw.ts` - OpenClaw integration
- `services/notifications.ts` - ntfy.sh notifications
- `services/errorTracking.ts` - Sentry integration

### Tests

**Move to tezit-protocol:**
- Core Tezit Protocol tests
- Federation tests
- TIP compliance tests

**Stay in MyPA:**
- OpenClaw integration tests
- Onboarding tests
- MyPA-specific feature tests

---

## Migration Strategy

### Step 1: Create tezit-protocol Repo

```bash
# Create new repo
mkdir tezit-protocol
cd tezit-protocol
git init
git remote add origin https://github.com/yourorg/tezit-protocol.git

# Set up basic structure
mkdir -p spec server/src/{routes,services,db,middleware} clients docs
```

### Step 2: Extract Protocol Spec

**File:** `PROTOCOL.md`

```markdown
# Tezit Protocol v1.0

## Abstract

Tezit is an open protocol for AI-assisted team communication. It defines a standard format for messages with rich context ("Tezits"), a federated architecture for cross-team sharing, and the Tez Interrogation Protocol (TIP) for grounded Q&A.

## 1. Core Concepts

### 1.1 Tez (Message + Context Iceberg)

A Tez is a communication unit with:
- **Surface:** Human-readable summary
- **Iceberg:** Full context (transcripts, documents, reasoning)
- **Metadata:** Author, timestamp, recipients, status
- **Interrogatable:** Can answer questions from its context

### 1.2 Federation

Tezit servers federate like email:
- Each team chooses their server (or self-hosts)
- Servers exchange Tezits via standardized API
- Users keep their data on their chosen server

### 1.3 Tez Interrogation Protocol (TIP)

Question-answering from Tez context only:
- Input: Question + Tez context
- Output: Answer + citations
- Verification: Answer must cite context

## 2. Data Formats

[JSON schemas...]

## 3. API Endpoints

[REST API spec...]

## 4. Federation Protocol

[Server-to-server protocol...]
```

### Step 3: Copy Core Code

```bash
# In mypa repo
cd /Volumes/5T\ Speedy/Coding\ Projects/team-sync

# Copy core Tezit files to tezit-protocol repo
cp backend/src/routes/cards.ts ../tezit-protocol/server/src/routes/tez.ts
cp backend/src/services/tezInterrogation.ts ../tezit-protocol/server/src/services/
cp backend/src/services/classify.ts ../tezit-protocol/server/src/services/
cp backend/src/db/fts.ts ../tezit-protocol/server/src/db/

# Copy schema (core tables only)
# Manually extract core tables from backend/src/db/schema.ts
```

### Step 4: Remove MyPA-Specific Code

In `tezit-protocol`, remove:
- OpenClaw integration code
- MyPA authentication (replace with pluggable auth)
- Onboarding flows
- PA Workspace references
- ntfy.sh notifications (make optional)

### Step 5: Add Federation Layer

**New file:** `server/src/routes/federation.ts`

```typescript
/**
 * Federation API - Server-to-server Tezit sharing
 */

// POST /federation/share
// Share a Tez with a user on another server
// Example: alice@tezit.chat shares with bob@company.com

// GET /federation/inbox
// Receive Tezits from federated servers

// POST /federation/verify
// Verify server identity (like email SPF/DKIM)
```

### Step 6: Update MyPA to Use Tezit Client

**In mypa repo:**

```bash
npm install @tezit/client
```

**Update backend:**

```typescript
import { TezitClient } from '@tezit/client';

const tezit = new TezitClient({
  serverUrl: process.env.TEZIT_SERVER || 'http://localhost:3002',
  authToken: 'mypa-backend-token'
});

// Replace direct DB calls with Tezit client
app.post('/api/cards/personal', async (req, res) => {
  const tez = await tezit.createTez({
    content: req.body.content,
    recipientType: 'self',
    userId: req.user.id
  });
  res.json({ tez });
});
```

---

## Timeline

### Week 1: MyPA Completion (Current Focus)
- ✅ Deploy boundary hardening
- ✅ Test MyPA.chat end-to-end
- ✅ Verify OpenClaw integration works
- ✅ Document what's deployed

### Week 2: Protocol Specification
- [ ] Write PROTOCOL.md (formal spec)
- [ ] Create JSON schemas
- [ ] Design federation protocol
- [ ] Draft API documentation

### Week 3: Reference Implementation
- [ ] Extract core code to tezit-protocol repo
- [ ] Remove MyPA-specific code
- [ ] Add federation layer
- [ ] Write comprehensive tests

### Week 4: Client Libraries
- [ ] Build TypeScript client
- [ ] Build Python client (optional)
- [ ] Build Go client (optional)
- [ ] Docker packaging for self-hosting

### Week 5: MyPA Migration
- [ ] Update MyPA to use @tezit/client
- [ ] Deploy MyPA as Tezit flagship instance
- [ ] Test federation between MyPA and self-hosted
- [ ] Document migration path

---

## Success Criteria

### Tezit Protocol v1.0
- [ ] PROTOCOL.md published (formal spec)
- [ ] Reference server implementation (open source)
- [ ] Docker self-hosting works (one command)
- [ ] TypeScript client library published
- [ ] Two servers federate successfully
- [ ] TIP compliance tests pass

### MyPA as Flagship Instance
- [ ] MyPA.chat runs on Tezit protocol
- [ ] Users can self-host and federate with MyPA
- [ ] MyPA remains easiest way to use Tezit
- [ ] OpenClaw integration is MyPA's unique value-add

---

## Utility-First Implementation Additions

These additions ensure extraction is not only technically correct but operationally useful.

### Workstream A: Share-to-Value speed
- [ ] Add explicit `shareIntent` to `POST /tez/share` (`decision`, `handoff`, `question`, `update`, `note`)
- [ ] Return proactive hints in share response for immediate recipient utility
- [ ] Add reply quick-actions in API payload (`approve`, `challenge`, `ask`, `ack`)

### Workstream B: Thread quality and retrieval
- [ ] Add `threadSummary` generation endpoint/update hook
- [ ] Add searchable `decisionTrail` metadata for team memory
- [ ] Add ranking signals for search (`engagementScore`, `recency`, `confidence`)

### Workstream C: Operator safety defaults
- [ ] Enforce team-scoped query guards in all routes
- [ ] Add redaction pipeline before persistence/share
- [ ] Add immutable audit events for share/edit/redact/export

---

## Safe Monetization Plumbing (No Data Exploitation)

### Product packaging architecture
- [ ] Implement plan entitlements as config flags, not code forks
- [ ] Define limits by policy (`maxMembers`, `storageQuotaGb`, `searchDepthDays`, `rateLimitMultiplier`)
- [ ] Keep self-host mode full-featured on protocol core

### Billing events to instrument in server
- [ ] `tez_shared`
- [ ] `tez_opened`
- [ ] `tez_replied`
- [ ] `tez_interrogated`
- [ ] `team_member_added`
- [ ] `policy_feature_used`
- [ ] `data_export_triggered`

### Suggested file additions in `tezit-protocol/server`
- `src/services/entitlements.ts` (plan checks)
- `src/services/usageMetering.ts` (event capture)
- `src/routes/admin/billing.ts` (usage summary endpoints)
- `src/db/schema.ts` additions:
  - `billing_events`
  - `team_entitlements`
  - `team_usage_counters`

### Guardrail
- [ ] No private Tez content stored in billing tables.
- [ ] Billing events must be metadata-only.

---

## Security and Trust Gates (Extraction Exit Criteria)

Before declaring extraction complete:
- [ ] Cross-team isolation tests pass (`read`, `search`, `interrogate`, `export`).
- [ ] Unauthenticated requests to compute-intensive routes are blocked.
- [ ] Secret scan confirms no runtime API keys in DB or logs.
- [ ] Data portability test passes (full export/import round-trip).
- [ ] Audit trail completeness test passes for all mutating actions.

---

## Monetization Rollout Sequence

### M0 (Protocol Launch)
- Free + self-host only
- Usage metering running silently (no paywall)

### M1 (Hosted Pro)
- Enable Pro entitlements on flagship instance
- Publish transparent pricing and trust commitments

### M2 (Business)
- Add SSO, policy packs, and audit export API
- Release admin dashboard for usage and governance

### M3 (Enterprise)
- Dedicated deployment templates + SLA operations
- Compliance evidence collection and support workflows

---

## Open Questions

1. **Federation Auth:** How do servers verify each other?
   - Option A: Shared secrets (like SMTP)
   - Option B: Public key cryptography
   - Option C: OAuth between servers

2. **Namespace:** How to handle user@server addressing?
   - Like email: alice@tezit.chat, bob@company.tezit.chat
   - Protocol: tezit://alice@tezit.chat/tez/ABC123

3. **Schema Versioning:** How to handle protocol updates?
   - Semantic versioning: v1.0, v1.1, v2.0
   - Servers negotiate compatible version

4. **Storage:** Should Tezit server be DB-agnostic?
   - Current: SQLite (easy self-hosting)
   - Future: Postgres, MySQL (enterprise scale)
   - Abstraction layer for different backends

5. **E2EE:** Should federation support end-to-end encryption?
   - For paranoid teams: Encrypt Tez content
   - Server only routes, can't read
   - Adds complexity, makes search harder

---

## Launch Strategy

### Phase 1: Soft Launch (Internal)
- Deploy tezit.chat (MyPA flagship instance)
- Test with 5-10 early users
- Iterate on protocol based on feedback

### Phase 2: Developer Preview
- Publish protocol spec
- Open source reference server
- Invite developers to self-host
- Build community around protocol

### Phase 3: Public Launch
- Announce Tezit Protocol
- Launch tezit.chat with free tier
- Write manifesto ("Why we federate")
- Get adoption from OpenClaw community

### Phase 4: Ecosystem Growth
- Other AI assistants integrate Tezit
- Third-party Tezit servers launch
- Protocol becomes industry standard
- MyPA remains best commercial implementation

---

## Next Steps

**Immediate (This Week):**
1. ✅ Finish MyPA.chat deployment
2. ✅ Test end-to-end
3. ✅ Document current state

**Next Week:**
1. Create tezit-protocol repo
2. Write PROTOCOL.md
3. Begin code extraction

**Question for You:**
- Should Tezit Protocol repo be public from day 1?
- Or private until v1.0 is ready?
- **Recommendation:** Public from day 1 (show we're serious about open)

---

Related monetization/trust plan: `docs/TEZIT_SAFE_MONETIZATION_BLUEPRINT.md`
