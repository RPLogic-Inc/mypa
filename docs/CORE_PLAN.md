# Core Plan: Tez as the Universal Inbox Layer

## Vision

Tez is the unified messaging surface where your AI PA's eyes are on everything. It's not a new messaging protocol — it's a layer that rides existing pipes (WhatsApp, iMessage, Telegram, Slack, email) to deliver context-rich, AI-interrogable messages.

Every Tez includes an interrogation link. Click it to ask AI questions answered strictly from the transmitted context, using the sender's AI resources. If both parties have OpenClaw, messages transfer as full Tez with complete context icebergs — the premium PA-to-PA path.

## How Tez Works

### Outbound (sending)
```
User: "Tell Alice about the budget decision"
  → PA creates Tez in relay (canonical record with context iceberg)
  → PA generates mirror (surface text + TIP interrogation link)
  → PA routes to Alice's preferred channel:
     - Alice has OpenClaw? → native Tez (full context, PA-to-PA)
     - Alice on WhatsApp? → WhatsApp message + interrogation link
     - Alice on email? → formatted email + .tez.json attachment + link
     - Alice on Telegram? → Telegram message + interrogation link
```

### Inbound (receiving)
```
WhatsApp message arrives → OpenClaw channel receives it
  → PA records as Tez in relay (with source channel metadata)
  → Tez appears in unified inbox (Canvas)
  → PA can: summarize, respond, action, or notify human

Native Tez arrives (PA-to-PA) → full context iceberg preserved
  → PA auto-interrogates context layers
  → Presents rich summary to human
```

### The Interrogation Link
```
https://mypa.chat/tez/abc123?token=xyz

Anyone with this link can:
  - Read the surface text
  - Ask AI questions about the context
  - AI answers ONLY from transmitted context (TIP)
  - Citations verified against source material
  - Uses SENDER's AI resources (not recipient's)
```

## What Exists (Built & Deployed)

| Component | Status | Tests |
|-----------|--------|-------|
| Backend API (cards, library, TIP, auth) | Deployed :3001 | 544+ passing |
| Tezit Relay (teams, contacts, conversations, threading) | Deployed :3002 | 118 passing |
| PA Workspace (Google email, calendar, drive, voice) | Deployed :3003 | 138 passing |
| Tezit Messenger Canvas (messaging UI) | Deployed at oc.mypa.chat | — |
| Library of Context (FTS5 search, engagement scoring) | Deployed | 7 tests |
| MyPA SKILL.md (teaches agent API) | Deployed | — |
| Tezit SKILL.md (teaches agent relay API) | Deployed | — |
| Tez Mirror (lossy sharing) | Built | — |
| TIP Interrogation | Built | — |
| Tez Email Transport | Built (pa-workspace) | — |
| CI/CD Pipeline | GitHub Actions | — |

## Build Order

### Phase 1: Unblock (Gateway Auth)
- Fix oc.mypa.chat "Health Offline" / "unauthorized: gateway token missing"
- Check `openclaw.json` gateway.auth.token on server
- Verify Gateway starts and dashboard loads

### Phase 2: Tezit Channel Plugin
- Build `extensions/tezit/` as OpenClaw channel plugin
- Register `tezit` channel → appears in Dashboard Channels section
- Outbound: `sendText` → POST /tez/share to relay
- Inbound: poll relay for new messages → inject into Chat session
- Config: relay URL, JWT credentials, auto-contact-registration
- Status: connection health, last message timestamps
- Reference: `.tmp/openclaw/extensions/mattermost/` (Mattermost plugin)

### Phase 3: Public TIP Endpoint
- Create token-scoped guest access for TIP interrogation
- `GET /tez/:id?token=xyz` → serves interrogation UI
- `POST /tez/:id/interrogate?token=xyz` → allows questions without JWT
- Token generated when Tez is shared, scoped to that specific Tez
- Rate-limited, read-only, no access to other tezits

### Phase 4: Unified Skill
- Merge MyPA SKILL.md + Tezit SKILL.md into one
- Agent knows: send/receive Tez, search Library, interrogate context, manage teams
- Agent knows: route to right channel, generate mirrors, include TIP links

### Phase 5: Redirect app.mypa.chat
- Nginx: redirect browser traffic to oc.mypa.chat
- Keep API proxy alive (Canvas + skills call it)
- Update DNS if needed

### Phase 6: Inbound Tez Bridge
- When messages arrive on any OpenClaw channel → record as Tez in relay
- Hook or agent behavior (via skill instructions)
- Tag source channel on each Tez

### Phase 7: Contact Routing
- Add `channels` field to relay contacts
- PA looks up recipient → routes to their preferred channel
- Fallback chain: native Tez → email → WhatsApp → etc.

## Social Network (Emergent)

The Tez graph IS a social network:
- **Contact graph**: who has exchanged Tez with whom
- **Context graph**: what knowledge has been shared between people
- **Interrogation graph**: who is asking questions about whose context
- **Team graph**: collaborative structures
- **Library graph**: shared knowledge searchable across relationships

## Revenue Model (from TWO_REPO_STRATEGY.md)

**MyPA.chat = "OpenClaw Made Easy"**
- Free: 5 users, 1GB context
- Pro: $8/user/month (unlimited Library, priority TIP, all channels)
- Enterprise: Custom (SSO, audit, compliance, dedicated support)

**Tezit Protocol = Open Infrastructure**
- Hosting service for relay + TIP endpoints
- Enterprise support contracts
- Self-hosting consulting

## Architecture Principles

1. **OpenClaw IS the system** — MyPA is data service + UX layer
2. **Tez rides existing pipes** — No new messaging protocol
3. **Context never dies** — Original content preserved forever
4. **Tez is canonical, mirrors are lossy** — Full context in relay, degraded copies via channels
5. **PA-first, not PA-only** — Admin-regulated human-send fallback until reliability proven
6. **Trust but verify** — TIP: questions answered only from transmitted context, with citations
7. **App name always configurable** — Never hardcode "MyPA"
