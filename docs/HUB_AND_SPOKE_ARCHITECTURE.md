# Hub-and-Spoke Architecture: Personal Instances + Team Hubs

**Date:** 2026-02-12
**Status:** Architectural proposal
**Depends on:** Tezit Protocol 1.2.4 federation (already built), multi-team membership (already built), OpenClaw per-user session routing (already built)

---

## The Problem

Today, MyPA.chat is a **single-team system**: one droplet, one OpenClaw gateway, one relay, one backend. Every user on the team shares the same runtime. This creates three unsolved problems:

1. **Cron jobs have no owner.** If User A asks "remind me every morning at 9am," the gateway would execute that job as the service identity, not as User A. There is no per-user scheduling boundary (see `UI_MODE_AND_MULTI_TEAM_PLAN.md` cron finding).

2. **Cross-team users have no home.** If Rob belongs to 5 teams, he has 5 separate team instances — but no central place where HIS personal AI, HIS library, and HIS schedule live. His data is scattered across 5 servers he doesn't fully control.

3. **Personal work has no boundary.** Personal reminders, private research, draft tezits, and personal CRM contacts currently share a database with team data. There's no clean separation between "mine" and "ours."

---

## The Insight

> Every person needs their own cheap MyPA instance. Teams are coordination hubs. The same app serves both roles.

This maps directly to how email works:
- Your personal Gmail = your personal MyPA instance
- Your company Google Workspace = your team's MyPA instance
- You have one inbox that aggregates across both
- Your personal account persists even when you leave a company

---

## Architecture

```
                    ┌──────────────────────────┐
                    │    Rob's Personal Hub     │
                    │     (rob.mypa.chat)       │
                    │                          │
                    │  OpenClaw (personal PA)   │
                    │  Library (personal)       │
                    │  CRM (personal contacts)  │
                    │  Scheduler (cron jobs)    │
                    │  Relay (federation peer)  │
                    │                          │
                    │  $4-6/mo droplet          │
                    └────────────┬─────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
  ┌─────────▼─────────┐  ┌──────▼──────────┐  ┌──────▼──────────┐
  │   NovaMind Team   │  │  The Prices     │  │  Design Guild   │
  │  (nova.mypa.chat) │  │ (prices.mypa.c) │  │ (guild.mypa.c)  │
  │                   │  │                 │  │                 │
  │  Shared CRM       │  │  2 members      │  │  4 members      │
  │  Team Library     │  │  Family context │  │  Client projects│
  │  PA Workspace     │  │                 │  │                 │
  │  10 members       │  │  $4/mo          │  │  $6/mo          │
  │  $12/mo           │  │                 │  │                 │
  └───────────────────┘  └─────────────────┘  └─────────────────┘
```

### Two Instance Modes, One Codebase

The same MyPA.chat codebase runs in two modes, controlled by a single env var:

| | Personal Instance (Spoke) | Team Instance (Hub) |
|---|---|---|
| **`INSTANCE_MODE`** | `personal` | `team` (default, current behavior) |
| **Users** | 1 (the owner) | Many (team members) |
| **OpenClaw** | Personal PA with private memory | Shared gateway with per-user session routing |
| **Library** | Personal context (persistent across teams) | Team context (shared, team-scoped) |
| **CRM** | Personal contacts | Shared team CRM |
| **Scheduler** | Personal cron jobs, reminders | Team automations (admin-controlled) |
| **Relay** | Federation peer (connects to team hubs) | Federation peer (serves team members) |
| **Cost** | $4-6/mo (512MB-1GB droplet) | Scales with team size |
| **Admin** | Self (always admin of own instance) | Team admins manage members |

---

## What Rob Sets Up (1 Person, 5 Teams)

### Rob's personal instance: `rob.mypa.chat`

**What it runs:**
- Backend (port 3001) — personal cards, library, auth
- Relay (port 3002) — federation peer, personal conversations
- OpenClaw Gateway (port 18789) — Rob's personal PA
- Scheduler (new service, port 3004) — cron jobs, reminders

**What it stores:**
- Rob's personal Library of Context (research, notes, ideas)
- Rob's personal CRM (contacts across all teams + personal)
- Rob's AI memory and preferences
- Rob's scheduled jobs ("remind me every Monday...", "send weekly summary...")
- Federated copies of team tezits delivered to Rob

**What it does NOT store:**
- Other users' data (there are no other users)
- Team-level CRM or team library (those live on team hubs)
- Team admin settings

**Cost:** ~$4-6/mo (DigitalOcean 512MB-1GB droplet)

### Each of Rob's 5 teams

Rob doesn't set up team instances — team admins do. Rob **joins** via federation:

| Team | Instance | Rob's Role | How Rob Connects |
|---|---|---|---|
| NovaMind | `nova.mypa.chat` | Engineering lead | Relay federation (invited by team admin) |
| The Prices | `prices.mypa.chat` | Family member | Relay federation (self-created family team) |
| Design Guild | `guild.mypa.chat` | Freelance contributor | Relay federation (invited) |
| Open Source Project | `oss.mypa.chat` | Maintainer | Relay federation (public, open mode) |
| Consulting Client | `acme.mypa.chat` | External advisor | Relay federation (scoped access) |

### The joining flow

1. Team admin generates invite: `https://nova.mypa.chat/join/VLVB3LQV`
2. Rob opens the invite on his personal instance
3. Rob's relay calls `POST nova.mypa.chat/federation/verify` (trust handshake)
4. Nova's relay adds Rob's personal relay as a trusted federated peer
5. Rob's personal instance records the team membership: `{teamId, hubHost, role, joinedAt}`
6. From now on, team tezits addressed to Rob are delivered to `rob.mypa.chat` via federation

**Rob never logs into team instances directly.** His personal PA aggregates everything.

---

## How Cross-Team Coordination Works

### Rob's morning briefing

Rob asks his personal PA: "What's going on today?"

His personal PA:
1. Checks Rob's personal library (personal reminders, notes)
2. Queries each team hub via federation API:
   - `GET nova.mypa.chat/api/pa/briefing` (with Rob's scoped federation token)
   - `GET prices.mypa.chat/api/pa/briefing`
   - `GET guild.mypa.chat/api/pa/briefing`
   - ... (for each team)
3. Checks Rob's personal scheduler for due reminders
4. Synthesizes a unified briefing:

> "Morning Rob. NovaMind: 2 pending tezits from Priya (architecture review). Prices: Ros sent a tez about groceries. Design Guild: new client brief arrived. You have a personal reminder about the dentist at 2pm."

### Rob sends a Tez to a teammate

Rob tells his PA: "Tell Priya the API design looks good."

1. Rob's personal PA classifies: DM to Priya Sharma @ NovaMind
2. Creates a Tez on Rob's personal relay
3. Rob's relay federates the Tez to `nova.mypa.chat` (NovaMind's hub)
4. NovaMind's relay delivers it to Priya (either directly if she's a hub-only user, or federates to her personal instance if she has one)

### Rob sets a personal cron job

Rob: "Every Friday at 4pm, summarize my week across all teams."

1. Rob's personal scheduler creates: `{schedule: "0 16 * * 5", action: "cross-team-weekly-summary", userId: rob}`
2. Every Friday at 4pm, the scheduler:
   a. Authenticates as Rob
   b. Queries each team hub for Rob's activity that week
   c. Queries Rob's personal library for personal tezits
   d. Has Rob's PA synthesize a weekly summary
   e. Creates a personal Tez with the summary

This runs on ROB'S instance, as ROB'S identity. No shared gateway confusion.

---

## The UI: One App, Scope Switcher

The Canvas UI stays the same app. The key addition is a **scope switcher**:

```
┌─────────────────────────────────────────────┐
│  [Personal ▾]  [🔍 Search]  [⚙️ Settings]  │
├─────────────────────────────────────────────┤
│                                             │
│  Scope options:                             │
│  ● Personal (default)                       │
│  ──────────────────                         │
│  ○ NovaMind                                 │
│  ○ The Prices                               │
│  ○ Design Guild                             │
│  ○ Open Source Project                      │
│  ○ Consulting Client                        │
│  ──────────────────                         │
│  ○ All Teams (aggregate view)               │
│                                             │
└─────────────────────────────────────────────┘
```

### What changes per scope:

| Scope | Chat Stream | Library | CRM | AI Chat |
|---|---|---|---|---|
| **Personal** | Personal tezits + federated copies | Personal library | Personal contacts | Personal PA (local OpenClaw) |
| **Team X** | Team X tezits (via federation API) | Team X library (via federation) | Team X CRM (via federation) | Personal PA with Team X context injected |
| **All Teams** | Merged feed, sorted by time | Federated search across all | Combined view | Personal PA with multi-team context |

**Critical: AI Chat always uses YOUR personal OpenClaw.** When you switch to a team scope, your PA queries team data via federation — but reasoning, memory, and preferences stay on your personal instance. The team hub never runs your personal PA.

---

## Data Flow Patterns

### Pattern 1: Personal → Team (Publishing)

```
Rob's PA creates a Tez
    │
    ▼
Rob's personal relay stores it locally
    │
    ▼
Federation routes it to NovaMind's relay
    │
    ▼
NovaMind's relay delivers to team members
```

### Pattern 2: Team → Personal (Receiving)

```
Priya sends a team Tez on NovaMind
    │
    ▼
NovaMind's relay identifies Rob as federated
    │
    ▼
Federation delivers to Rob's personal relay
    │
    ▼
Rob's personal relay stores a federated copy
    │
    ▼
Rob's PA can read it locally (no network needed)
```

### Pattern 3: Cross-Team Query (Aggregation)

```
Rob asks "search all teams for 'budget'"
    │
    ▼
Rob's PA calls federation search on each hub:
  ├── nova.mypa.chat/api/library/search?q=budget
  ├── prices.mypa.chat/api/library/search?q=budget
  ├── guild.mypa.chat/api/library/search?q=budget
  └── (local) personal library search
    │
    ▼
Results merged, deduplicated, presented
```

### Pattern 4: Cron/Scheduled Job

```
Friday 4pm: Rob's scheduler triggers "weekly summary"
    │
    ▼
Scheduler authenticates AS Rob (mints scoped token)
    │
    ▼
Queries each team hub for Rob's weekly activity
    │
    ▼
Rob's PA synthesizes summary
    │
    ▼
Creates personal Tez with summary
```

---

## Security Model

### Trust Boundaries

```
┌─ Rob's Trust Boundary ──────────────────────────┐
│                                                  │
│  Rob's Personal Instance                         │
│  ● Full access to personal data                  │
│  ● Full access to personal AI memory             │
│  ● Scoped federation tokens for each team        │
│                                                  │
│  Rob controls:                                   │
│  ● What personal data is shared with teams       │
│  ● Which teams can deliver to his instance       │
│  ● What his PA can access on team hubs           │
│                                                  │
└──────────────────────────────────────────────────┘

┌─ Team Trust Boundary ───────────────────────────┐
│                                                  │
│  NovaMind Team Instance                          │
│  ● Team data scoped by membership                │
│  ● Rob sees only what his role permits           │
│  ● Team admin controls federation policies       │
│                                                  │
│  Team admin controls:                            │
│  ● Who can join via federation                   │
│  ● What data federated members can access        │
│  ● Model allowlists, token budgets               │
│  ● Audit trail of federated access               │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Federation Token Scoping

When Rob's personal instance connects to a team hub, it receives a **scoped federation token** — NOT Rob's full team credentials:

```typescript
interface FederationScope {
  userId: string;          // Rob's ID on the team
  teamId: string;          // NovaMind team ID
  permissions: string[];   // ["read:tez", "write:tez", "read:library", "read:briefing"]
  issuedBy: string;        // nova.mypa.chat
  expiresAt: string;       // Short-lived, auto-renewed
  spokeHost: string;       // rob.mypa.chat (for delivery routing)
}
```

**What the federation token CANNOT do:**
- Access other users' data
- Modify team settings
- Create/delete team members
- Access team CRM directly (goes through API scoping)
- Execute team-level admin operations

### Personal Data Stays Personal

Rob's personal instance stores:
- Personal AI memory → never sent to team hubs
- Personal CRM contacts → shared with teams only if Rob explicitly publishes them
- Personal cron jobs → execute locally, never on team hubs
- Draft tezits → local until published

**Leaving a team is clean:**
1. Rob leaves NovaMind
2. Rob's relay removes NovaMind from its federation peers
3. Rob keeps all federated copies of tezits already delivered to him (they're HIS copies)
4. NovaMind revokes Rob's federation token
5. Rob's personal library, AI memory, and contacts are unaffected

---

## What Changes in the Codebase

### Phase 0: Configuration (Small, Now)

**New env var:** `INSTANCE_MODE=personal|team`

**Files to modify:**
- `backend/src/config/app.ts` — add `INSTANCE_MODE`
- `relay/src/config.ts` — add `INSTANCE_MODE`
- `canvas/src/config/app.ts` — add `VITE_INSTANCE_MODE`

**Behavior changes:**
- `personal` mode: hide team management UI, show scope switcher, enable cross-team aggregation
- `team` mode: current behavior (default)

### Phase 1: Federation Enhancements (Medium, Next)

**New relay endpoints:**

```
POST /federation/join-as-spoke     # Personal instance joins a team hub
POST /federation/approve-spoke     # Team admin approves a spoke
GET  /federation/team-briefing     # Scoped briefing for federated member
GET  /federation/team-search       # Scoped library search for federated member
POST /federation/team-scope-token  # Issue scoped token to spoke
```

**New relay tables:**

```sql
-- Track which teams this instance is a spoke for
spoke_memberships {
  id TEXT PRIMARY KEY,
  hubHost TEXT NOT NULL,          -- e.g., nova.mypa.chat
  teamId TEXT NOT NULL,           -- team ID on the hub
  teamName TEXT,
  userId TEXT NOT NULL,           -- local user ID
  role TEXT DEFAULT 'member',
  federationToken TEXT,           -- scoped token from hub
  tokenExpiresAt TEXT,
  joinedAt TEXT,
  lastSyncAt TEXT
}

-- Track which spokes are connected to this hub
hub_spoke_registry {
  id TEXT PRIMARY KEY,
  spokeHost TEXT NOT NULL,        -- e.g., rob.mypa.chat
  userId TEXT NOT NULL,           -- user's ID on this team
  role TEXT DEFAULT 'member',
  approvedAt TEXT,
  approvedBy TEXT,                -- admin who approved
  lastSeenAt TEXT,
  status TEXT DEFAULT 'active'    -- active | suspended | revoked
}
```

### Phase 2: Personal Aggregation (Medium, After Phase 1)

**New backend endpoints (personal mode only):**

```
GET /api/pa/cross-team-briefing     # Aggregated briefing from all teams
GET /api/library/federated-search   # Search across personal + all teams
GET /api/scheduler/jobs             # List personal scheduled jobs
POST /api/scheduler/jobs            # Create personal scheduled job
DELETE /api/scheduler/jobs/:id      # Remove scheduled job
```

**New service: Scheduler (personal mode only):**

```
scheduler/
  src/
    index.ts             # Express server, port 3004
    jobs.ts              # Job execution engine
    db/schema.ts         # scheduled_jobs table
    routes/jobs.ts       # CRUD for scheduled jobs
```

Scheduler jobs have explicit ownership:
```typescript
interface ScheduledJob {
  id: string;
  userId: string;              // Always the personal instance owner
  schedule: string;            // Cron expression
  action: string;              // e.g., "cross-team-summary", "reminder", "check-inbox"
  scope: "personal" | string;  // "personal" or a teamId
  payload: Record<string, unknown>;
  enabled: boolean;
  lastRunAt: string;
  nextRunAt: string;
}
```

### Phase 3: Canvas Scope Switcher (UI, After Phase 1)

**Files to modify:**
- `canvas/src/components/Sidebar.tsx` — add scope switcher
- `canvas/src/hooks/useAuth.ts` — track active scope
- `canvas/src/services/api.ts` — route requests based on scope
- `canvas/src/hooks/useComms.ts` — federation-aware message loading

**New state:**
```typescript
interface AppScope {
  type: "personal" | "team" | "all";
  teamId?: string;
  hubHost?: string;  // For federated team queries
}
```

### Phase 4: Provisioning Updates (Deploy, After Phase 1)

**`deploy/provision-team.sh`** — already handles team instances. Add:

**`deploy/provision-personal.sh`** — new script for personal instances:
- Smaller droplet ($4-6/mo)
- Single-user setup
- `INSTANCE_MODE=personal`
- OpenClaw configured for single user (no session routing needed)
- Scheduler service enabled
- No PA Workspace (optional, personal instances don't need team email domain)

---

## Cost Model

### For Rob (1 person, 5 teams)

| What | Monthly Cost | Who Pays |
|---|---|---|
| Rob's personal instance | $4-6 | Rob |
| NovaMind team membership | $0 (or $8/mo Pro tier) | NovaMind pays for team instance |
| The Prices family team | $4 | Rob (self-hosted family team) |
| Design Guild membership | $0 | Guild admin pays |
| OSS Project membership | $0 | Free tier / sponsored |
| Client team access | $0 | Client pays for their instance |

**Rob's total: $4-10/mo** for a personal AI PA that coordinates across 5 teams.

### For a 10-person team (NovaMind)

| What | Monthly Cost |
|---|---|
| Team instance (4GB/2CPU droplet) | $24 |
| PA Workspace (10 Google accounts) | $70 |
| Twenty CRM (Docker, same droplet) | $0 (included) |
| **Total** | **$94/mo** (~$9.40/user) |

Each team member optionally runs their own personal instance ($4-6/mo) for cross-team aggregation and personal work.

---

## Migration Path (Current → Hub-and-Spoke)

### Step 1: Current users continue as-is
The existing team instance at `164.90.135.75` continues working. `INSTANCE_MODE=team` is the default. No breaking changes.

### Step 2: Add personal instance support
Build `INSTANCE_MODE=personal` path. Rob provisions a personal instance. It connects to the existing team instance via federation (already working).

### Step 3: Team members optionally adopt personal instances
Any team member can provision a personal instance and join the team via federation. Those who don't continue using the team instance directly (team hub serves as their "home" for that team).

### Step 4: Hybrid model stabilizes
Some users are "hub-only" (access team via team instance directly), others are "spoke users" (access team via their personal instance's federation). Both are first-class. The team hub doesn't care how you connect.

---

## What This Means for the Product

### MyPA becomes TWO products from ONE codebase:

1. **MyPA Personal** — "Your AI PA, $4/month"
   - Personal AI assistant with memory and scheduling
   - Connects to any number of teams
   - Your data on your server
   - Voice-first, cron-capable, always available

2. **MyPA Team** — "AI-powered team coordination, $8/user/month"
   - Shared CRM, library, and communication
   - PA Workspace (real email/calendar per member)
   - Admin controls, governance, audit trail
   - Members can use personal instances or access directly

### The flywheel:
- Personal instances drive adoption (every person wants a PA)
- Team instances drive revenue (teams pay for coordination)
- Federation connects them (network effect)
- The protocol is open (Tezit), the product is opinionated (MyPA)

---

## Open Questions

1. **Hub-only users**: If a team member doesn't have a personal instance, do they access the team hub directly (current behavior) or must they provision a personal instance? **Recommendation:** Hub-only is fine. Personal instance is optional. Don't force it.

2. **Which OpenClaw runs the PA?** When Rob queries NovaMind data, does his personal OpenClaw do the reasoning, or NovaMind's? **Recommendation:** Always Rob's personal OpenClaw. Team data is fetched via federation API, but reasoning is personal. This preserves Rob's memory, preferences, and privacy.

3. **Team cron jobs**: Should team hubs support team-level scheduled jobs (e.g., "post standup summary every day")? **Recommendation:** Yes, but only for team admin role, and they run as the team service identity with explicit scope badges. This is Phase 2+ work.

4. **Federation token lifecycle**: How are scoped tokens renewed? **Recommendation:** Short-lived tokens (1 hour), auto-renewed via refresh endpoint. Hub revokes on leave/suspend.

5. **Offline/disconnected**: What happens when Rob's personal instance can't reach a team hub? **Recommendation:** Rob sees federated copies already delivered. New team data queues on the hub until Rob's relay is reachable (existing outbox retry logic handles this).

---

## Related Documents

- `docs/UI_MODE_AND_MULTI_TEAM_PLAN.md` — Cron finding, current isolation analysis
- `docs/TWO_REPO_STRATEGY.md` — MyPA product vs Tezit protocol separation
- `docs/USER_STORIES_AND_PERSONAS.md` — Persona 11 (solo consultant) is the personal instance archetype
- `docs/OPENCLAW_BOUNDARY_EXECUTION.md` — OpenClaw boundary hardening (prerequisite)
- `relay/src/routes/federation.ts` — Existing federation implementation
- `relay/tests/federation.test.ts` — 2100+ lines of federation tests
