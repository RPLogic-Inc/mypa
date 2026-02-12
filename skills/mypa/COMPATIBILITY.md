# MyPA Skill — Compatibility Matrix

This document defines capability levels for external OpenClaw runtimes connecting to a MyPA backend. Each level builds on the previous one.

## Capability Levels

### Level 0: Read-Only

Minimum viable integration. Read data, no modifications.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Authenticate |
| `/api/auth/refresh` | POST | Refresh token |
| `/api/auth/bootstrap` | GET | Discover teams, capabilities, endpoints |
| `/api/pa/context` | GET | User context, team members, pending cards |
| `/api/pa/briefing` | GET | Structured briefing data |
| `/api/cards/feed` | GET | Card feed with pagination |
| `/api/library/search` | GET | FTS5 full-text search |

**Required env:** `MYPA_API_URL`, `MYPA_EMAIL`, `MYPA_PASSWORD`

### Level 1: Read-Write

Full card lifecycle management.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| Level 0 endpoints | | |
| `/api/cards/classify` | POST | Classify message intent (self/dm/broadcast) |
| `/api/cards/personal` | POST | Create personal tez |
| `/api/cards/team` | POST | Create team tez (requires `teamId` for multi-team users) |
| `/api/cards/:id` | PATCH | Update card status |
| `/api/cards/:id/respond` | POST | Respond to a tez |
| `/api/cards/:id/snooze` | POST | Snooze a tez |
| `/api/tez/:id/interrogate` | POST | TIP interrogation |

**Required env:** `MYPA_API_URL`, `MYPA_EMAIL`, `MYPA_PASSWORD`

### Level 2: Full + Relay

PA-to-PA messaging via Tezit Relay.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| Level 1 endpoints | | |
| `$RELAY_URL/tez/share` | POST | Send Tez via relay |
| `$RELAY_URL/tez/:id/reply` | POST | Thread reply |
| `$RELAY_URL/tez/stream` | GET | Team message feed |
| `$RELAY_URL/unread` | GET | Unread counts |
| `$RELAY_URL/contacts/search` | GET | Search contacts |
| `$RELAY_URL/conversations` | GET/POST | DM/group conversations |

**Required env:** `MYPA_API_URL`, `MYPA_EMAIL`, `MYPA_PASSWORD`, `RELAY_URL`

### Level 3: Federation

Cross-team data aggregation for personal instances.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| Level 2 endpoints | | |
| `$RELAY_URL/federation/my-hubs` | GET | List connected team hubs |
| `/api/cross-team/briefing` | GET | Aggregated briefing across all hubs |
| `/api/cross-team/search` | GET | Federated search across hubs |

**Required env:** `MYPA_API_URL`, `MYPA_EMAIL`, `MYPA_PASSWORD`, `RELAY_URL`
**Required config:** `INSTANCE_MODE=personal` on the backend

## Frozen Contracts

The following endpoints have stable request/response shapes. Breaking changes require a major version bump.

| Endpoint | Frozen Since |
|----------|-------------|
| `POST /api/auth/login` | v1.0 |
| `GET /api/auth/bootstrap` | v1.1 |
| `GET /api/pa/context` | v1.0 |
| `GET /api/pa/briefing` | v1.0 |
| `POST /api/cards/classify` | v1.0 |
| `POST /api/cards/personal` | v1.0 |
| `POST /api/cards/team` | v1.0 |
| `GET /api/cards/feed` | v1.0 |
| `GET /api/library/search` | v1.0 |
| `POST /api/tez/:id/interrogate` | v1.0 |

## Version Requirements

- **Backend:** Node.js 20+, SQLite with Drizzle ORM
- **Relay:** Node.js 20+, SQLite with Drizzle ORM
- **JWT:** Shared secret across all services (backend, relay, pa-workspace)
- **Token TTL:** Access 15min, Refresh 7 days
