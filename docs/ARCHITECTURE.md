# Architecture

MyPA is a monorepo with four services that communicate via HTTP APIs and share a JWT secret for authentication.

## Service Overview

```
                     ┌─────────────────────────┐
                     │      Canvas (SPA)        │
                     │   React + Vite + Tailwind │
                     │      :80 / :5174         │
                     └──────────┬───────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
    ┌─────────▼─────────┐  ┌───▼───────────┐  ┌──▼──────────────┐
    │     Backend        │  │    Relay       │  │  OpenClaw       │
    │   Express + SQLite │  │ Express+SQLite │  │  Gateway        │
    │      :3001         │  │    :3002       │  │   :18789        │
    │                    │  │                │  │  (external)     │
    │  Cards, Library,   │  │ Teams, Contacts│  │                 │
    │  Auth, TIP,        │  │ Conversations  │  │  AI brain,      │
    │  OpenClaw proxy    │  │ Federation     │  │  voice, memory  │
    └────────────────────┘  └────────────────┘  └─────────────────┘
```

## Request Routing

Nginx (or the Docker canvas container) routes requests based on URL prefix:

| Path | Destination | Purpose |
|------|-------------|---------|
| `/api/auth/*` | Backend :3001 | Authentication |
| `/api/cards/*` | Backend :3001 | Tez CRUD |
| `/api/library/*` | Backend :3001 | Full-text search |
| `/api/pa/*` | Backend :3001 | PA context + briefing |
| `/api/openclaw/*` | Backend :3001 | OpenClaw proxy (streaming) |
| `/api/settings/*` | Backend :3001 | User settings |
| `/api/users/*` | Backend :3001 | User management |
| `/api/tez/*` | Backend :3001 | TIP interrogation, export |
| `/api/*` (catch-all) | Relay :3002 | Teams, contacts, conversations |
| `/*` | Canvas | SPA (static files) |

The relay catch-all strips the `/api/` prefix before proxying.

## Database

All services use **SQLite** via **Drizzle ORM**. No external database server needed.

| Service | DB File | Key Tables |
|---------|---------|------------|
| Backend | `mypa.db` | users, teams, user_teams, cards, card_context, card_responses, card_reactions, share_tokens |
| Relay | `tezit-relay.db` | contacts, teams, team_members, tez, tez_context, conversations, conversation_members, messages |
| PA Workspace | `pa-workspace.db` | identities, provisioned_accounts |

Schema files:
- [backend/src/db/schema.ts](../backend/src/db/schema.ts)
- [relay/src/db/schema.ts](../relay/src/db/schema.ts)

## Authentication

JWT with shared secret across all services.

```
Client → POST /api/auth/login → Backend mints JWT
                                   │
                                   ▼
              { accessToken (15min), refreshToken (7 days) }
                                   │
                                   ▼
Client stores tokens in localStorage
Client sends: Authorization: Bearer <accessToken>

All services verify tokens using the same JWT_SECRET.
```

Token refresh: `POST /api/auth/refresh` with the refresh token.

## Key Concepts

### Tez

A message with a context iceberg. Every Tez has:
- **Surface text** -- what you see in the feed
- **Context layers** -- background, facts, artifacts, relationships, constraints, hints
- **Metadata** -- intent, urgency, visibility, recipients

### TIP (Tez Interrogation Protocol)

Ask questions answered ONLY from the transmitted context of a specific Tez. Citations are verified against the context layers. Uses the sender's AI resources.

### Library of Context

FTS5 full-text search across all preserved context. Engagement scoring:
- Interrogations x5 + citations x4 + responses x3 + mirrors x2 + reactions x1

### Federation

Server-to-server communication between MyPA instances using Ed25519 key pairs for identity. Enables cross-team messaging while maintaining data sovereignty.

### Instance Modes

| Mode | `INSTANCE_MODE` | Users | Purpose |
|------|-----------------|-------|---------|
| **Team** | `team` (default) | Many | Shared workspace, CRM, team library |
| **Personal** | `personal` | 1 | Personal AI hub, cross-team aggregation |

## OpenClaw Integration

MyPA is a data service. OpenClaw is the AI brain.

```
User → Canvas Chat → OpenClaw Gateway → AI Reasoning
                          │
                          ▼
                    MyPA Skill (SKILL.md)
                          │
                    ┌─────┴─────┐
                    │           │
              Backend API  Relay API
              (cards,      (contacts,
               library,     conversations,
               TIP)         federation)
```

The backend proxies OpenClaw requests via `/api/openclaw/*`, adding the gateway token server-side so it's never exposed to clients.

## Environment Variables

See the per-service `.env.example` files:
- [backend/.env.example](../backend/.env.example)
- [relay/.env.example](../relay/.env.example)
- [pa-workspace/.env.example](../pa-workspace/.env.example)
- [canvas/.env.example](../canvas/.env.example)

All services share `JWT_SECRET`. Canvas uses `VITE_*` variables (compile-time).
