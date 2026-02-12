# Tezit Messenger -- OpenClaw Skill

## Overview

You have access to Tezit Messenger -- a team communication system where every message is a **Tez**: a message with an interrogable context iceberg underneath. Think "NotebookLM bundled with every text you send."

A Tez has:
- **Surface text** -- the human-readable message (what you'd normally type)
- **Context layers** -- structured supporting information (background, facts, artifacts, relationships, constraints, hints)
- **Threading** -- replies form conversation threads
- **Recipients** -- messages go to teams or direct conversations

## API Base URL

`http://localhost:3002` (proxied via nginx at `/relay/`)

## Authentication

All endpoints require: `Authorization: Bearer {jwt_token}`

The JWT must contain a `sub` claim (userId). Token is shared with the app backend.

---

## Common Workflows

### Send a message to someone

```
1. Find them:       GET /contacts/search?q=Alice
2. Create/find DM:  POST /conversations  { "type": "dm", "memberIds": ["their-user-id"] }
   (Returns existing DM if one already exists)
3. Send:            POST /conversations/{id}/messages
   {
     "surfaceText": "Here's the API spec we discussed",
     "context": [
       { "layer": "artifact", "content": "OpenAPI 3.0 spec for the /users endpoint..." },
       { "layer": "background", "content": "We agreed on REST over GraphQL in Monday's meeting" },
       { "layer": "constraint", "content": "Must maintain backward compat with v2 clients" }
     ]
   }
```

### Share with a team

```
1. Find team:  GET /teams  (lists teams user belongs to)
2. Share:      POST /tez/share
   {
     "teamId": "team-uuid",
     "surfaceText": "Decision: we're shipping the v3 API next Thursday",
     "type": "decision",
     "urgency": "high",
     "context": [
       { "layer": "background", "content": "After reviewing the migration risks..." },
       { "layer": "fact", "content": "95% of clients are already on v2.5" }
     ]
   }
```

### Answer "what did X mean by Y?"

```
1. Get the tez:    GET /tez/{id}
   Response includes full context layers -- the iceberg under the surface
2. Read the context layers to answer the question
3. IMPORTANT: Only answer from the transmitted context. Cite the specific layer.
   Example: "Based on the 'background' context layer, Alice meant..."
```

### Summarize what a team discussed

```
1. Get team feed:  GET /tez/stream?teamId={id}
   Returns recent messages with context counts
2. For messages with context, fetch full details: GET /tez/{id}
3. Synthesize a summary from surface text + context layers
```

### Reply to a message (threading)

```
POST /tez/{id}/reply
{
  "surfaceText": "Good point, but consider this counter-argument...",
  "context": [
    { "layer": "fact", "content": "The benchmark data shows 40ms latency, not 100ms" }
  ]
}
```

### "Action this" -- execute a Tez as a work order

```
1. Get the full Tez: GET /tez/{id}
2. Read ALL context layers -- they contain the requirements, constraints, rationale
3. Execute using your other skills (code, web, file tools, etc.)
4. Reply confirming completion:
   POST /tez/{id}/reply
   { "surfaceText": "Done. I updated the hero section per the specs in the context." }
```

### Create a team

```
POST /teams  { "name": "Engineering" }
→ Creator becomes admin automatically
```

### Add someone to a team (admin only)

```
1. Find them:  GET /contacts/search?q=Bob
2. Add:        POST /teams/{id}/members  { "userId": "bob-user-id" }
```

### Check unread messages

```
GET /unread
→ { "teams": [{"teamId": "...", "count": 3}], "conversations": [{"conversationId": "...", "count": 1}], "total": 4 }
```

---

## Full Endpoint Reference

### Contacts
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/contacts/register` | `{ displayName, email? }` | `{ data: Contact }` |
| GET | `/contacts/me` | - | `{ data: Contact }` |
| GET | `/contacts/:userId` | - | `{ data: Contact }` |
| GET | `/contacts/search?q=` | - | `{ data: Contact[] }` |

### Conversations (DMs + Groups)
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/conversations` | `{ type: "dm"\|"group", memberIds, name? }` | `{ data: Conversation }` |
| GET | `/conversations` | - | `{ data: Conversation[] }` (with lastMessage + unreadCount) |
| GET | `/conversations/:id/messages` | `?before=ISO8601` | `{ data: Tez[], meta: { count, hasMore } }` |
| POST | `/conversations/:id/messages` | `{ surfaceText, context? }` | `{ data: Tez }` |
| POST | `/conversations/:id/read` | - | `{ data: { success } }` |

### Teams
| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/teams` | - | `{ data: Team[] }` (teams user belongs to) |
| POST | `/teams` | `{ name }` | `{ data: { id, name } }` |
| GET | `/teams/:id/members` | - | `{ data: TeamMember[] }` |
| POST | `/teams/:id/members` | `{ userId, role? }` | `{ data: TeamMember }` (admin only) |
| DELETE | `/teams/:id/members/:userId` | - | `{ data: { removed } }` (admin or self-leave) |

### Tez (Messages)
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/tez/share` | `{ teamId, surfaceText, type?, urgency?, context?, recipients? }` | `{ data: Tez }` |
| GET | `/tez/stream?teamId=` | `?before=ISO8601` | `{ data: Tez[], meta: { count, hasMore } }` |
| GET | `/tez/:id` | - | `{ data: TezFull }` (includes context layers + recipients) |
| POST | `/tez/:id/reply` | `{ surfaceText, context? }` | `{ data: Tez }` |
| GET | `/tez/:id/thread` | - | `{ data: Thread }` (all messages in thread) |

### Unread
| Method | Path | Returns |
|--------|------|---------|
| GET | `/unread` | `{ data: { teams: [{teamId, count}], conversations: [{conversationId, count}], total } }` |

### Health
| Method | Path | Returns |
|--------|------|---------|
| GET | `/health` | `{ status: "ok", service: "tezit-relay", version: "0.1.0" }` |

---

## Context Layer Types

When composing messages, attach context layers to give recipients (and their AI) the full picture:

| Layer | Purpose | Example |
|-------|---------|---------|
| `background` | Why this matters, history | "We've been discussing this since the Q3 review" |
| `fact` | Verified data points | "Revenue grew 23% QoQ per the latest report" |
| `artifact` | Documents, specs, code | "OpenAPI spec: { paths: { /users: ... } }" |
| `relationship` | How things connect | "This depends on the auth migration completing first" |
| `constraint` | Limitations, requirements | "Budget capped at $50k, must ship before March" |
| `hint` | Suggestions, intuitions | "I think the real issue is the database schema" |

## Tez Types

| Type | When to use |
|------|-------------|
| `note` | General communication (default) |
| `decision` | Recording a decision the team made |
| `handoff` | Delegating work to someone |
| `question` | Asking for input |
| `update` | Status update on ongoing work |

## Urgency Levels

| Urgency | When to use |
|---------|-------------|
| `critical` | Needs immediate attention |
| `high` | Important, today |
| `normal` | Standard priority (default) |
| `low` | When you get to it |
| `fyi` | No action needed, just awareness |
