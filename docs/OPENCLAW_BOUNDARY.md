# OpenClaw Boundary Hardening

## Document Purpose

This document tracks the architectural evolution of MyPA's OpenClaw Gateway integration, specifically the security hardening effort to establish a proper trust boundary between the MyPA backend and the OpenClaw Gateway.

**Date**: 2026-02-08
**Status**: In Progress (Wave 1: Security Foundation)
**Branch**: feat/openclaw-boundary-final

---

## Current State (Before Hardening)

### 1. Public Gateway Exposure (CRITICAL SECURITY ISSUE)

**Location**: `deploy/nginx-configs/mypa-app.conf` lines 75-81

```nginx
# OpenClaw Gateway (Canvas Web bridge)
location /v1/ {
    limit_req zone=app_api_limit burst=10;
    proxy_pass http://127.0.0.1:18789;
    include /etc/nginx/snippets/openclaw-auth.conf;
    proxy_buffering off;
}
```

**Problem**: The OpenClaw Gateway is exposed at `https://app.mypa.chat/v1/*` with a static shared token. This means:
- Any client that discovers the shared token can access the Gateway directly
- The shared token is in `/etc/nginx/snippets/openclaw-auth.conf` (server-side only, but still a shared secret)
- This bypasses MyPA's authentication and authorization layer entirely
- No user-level access control or rate limiting at the Gateway level

**Risk**: High - Unauthorized access to AI capabilities, potential abuse, data leakage

### 2. Agent Lifecycle Management in Backend

**Location**: `backend/src/services/onboarding.ts` lines 261-362

The backend currently:
- Calls `POST /v1/agents` to create OpenClaw agents during user onboarding
- Stores agent IDs in the `users.openclawAgentId` column
- Manages agent creation status in the `userOnboarding` table
- Handles agent creation failures and retries

**Why This is Wrong**:
- MyPA backend should not manage OpenClaw agent lifecycle
- OpenClaw Gateway is the system; MyPA is a data service + skill
- This creates tight coupling and duplicate state management
- OpenClaw Gateway should handle its own agent provisioning

### 3. OpenClaw Configuration in Team Settings

**Location**:
- `backend/src/db/schema.ts` lines 81-91 (team_settings table)
- `backend/src/routes/settings.ts` lines 20-46, 99-104, 181-185

The `team_settings` table stores:
- `openclawUrl`: Gateway URL (defaults to `http://localhost:18789`)
- `openclawToken`: Gateway auth token (encrypted in production)
- `openclawAgentTemplate`: Template name for agent creation
- `openclawTeamContext`: Team-specific context for all agents
- `openclawEnabledTools`: Array of enabled tools for agents

**Why This is Wrong**:
- Storing Gateway credentials in the application database is a security anti-pattern
- These settings are for agent lifecycle management, which should not be MyPA's concern
- The token is used for backend-to-Gateway API calls, which we're eliminating

### 4. Schema State

**User Table**:
- `users.openclawAgentId` (text, nullable) - stores agent ID from Gateway

**User Onboarding Table**:
- `userOnboarding.assistantCreated` (boolean) - whether agent was created
- `userOnboarding.assistantConfigured` (boolean) - whether agent was configured
- `userOnboarding.openclawAgentStatus` (enum: pending/creating/ready/failed) - agent creation status
- `userOnboarding.openclawAgentError` (text, nullable) - error message if failed

**Team Settings Table** (see section 3 above)

**Team Invites Table**:
- `teamInvites.openclawConfig` (JSON) - agent creation config for new users

---

## Target State (After Hardening)

### 1. No Public Gateway Exposure

**Change**: Remove the `/v1/` location block from nginx config, replace with explicit deny rule.

**Result**:
- `https://app.mypa.chat/v1/*` returns 403 Forbidden
- Gateway only accessible via authenticated backend proxy endpoints (future Wave)
- All Gateway access requires valid MyPA user JWT token

### 2. No Agent Lifecycle Management in Backend

**Change**: Remove all agent creation/management code from backend.

**Rationale**:
- OpenClaw Gateway manages its own agents
- Users get agents automatically when they authenticate with the Gateway
- MyPA should not know or care about agent IDs

**Code to Remove**:
- `onboarding.ts` - `createOpenClawAgent()` function
- `onboarding.ts` - Agent creation logic in `acceptInvite()`
- `settings.ts` - OpenClaw token/template/context management
- Any other agent lifecycle API calls

### 3. No OpenClaw Tokens in Database

**Change**: Remove OpenClaw-related columns from `team_settings` table.

**Columns to Remove**:
- `openclawUrl`
- `openclawToken`
- `openclawAgentTemplate`
- `openclawTeamContext`
- `openclawEnabledTools`

**Rationale**:
- Gateway credentials should not be stored in application database
- Configuration belongs in OpenClaw Gateway's own config
- MyPA backend should be stateless with respect to Gateway

### 4. Simplified Schema

**Keep** (for now, may deprecate later):
- `users.openclawAgentId` - may be useful for user-agent mapping, but not required
- Onboarding fields - track whether user has connected to PA (not agent creation)

**Remove**:
- All OpenClaw config in `team_settings`
- Agent creation status fields in `user_onboarding` (optional - could repurpose to track "first PA interaction")

---

## Architecture Principles

### The Correct Model

**OpenClaw Gateway IS the system.**

```
┌─────────────────────────────────────────────┐
│        OpenClaw Gateway (The System)        │
│                                             │
│  - AI brain / LLM orchestration             │
│  - Voice / TTS                              │
│  - Memory management                        │
│  - Agent lifecycle                          │
│  - Session management                       │
│  - Tool execution                           │
│  - User identity / auth                     │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  MyPA Skill (Plugin to OpenClaw)    │   │
│  │                                     │   │
│  │  - Tez data model + CRUD            │   │
│  │  - Tezit Protocol                   │   │
│  │  - Team coordination                │   │
│  │  - Notification delivery            │   │
│  │  - Library of Context               │   │
│  │  - Pure data service                │   │
│  │                                     │   │
│  │  Backend API: OpenClaw calls        │   │
│  │  /api/* with user JWT               │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Key Points**:
1. OpenClaw Gateway owns the user session and authentication
2. MyPA backend is a data API that OpenClaw calls via the MyPA skill
3. MyPA frontend is a specialized UI that bridges to OpenClaw via `openclawBridge.ts`
4. No reverse dependency: MyPA backend NEVER calls OpenClaw Gateway API

### Trust Boundary

**Before** (current):
```
User → nginx (shared token) → OpenClaw Gateway
User → nginx → MyPA Backend → (shared token) → OpenClaw Gateway
```

**After** (target):
```
User → nginx (JWT) → MyPA Backend (pure data API)
User → OpenClaw Gateway (via bridge) → calls MyPA Backend (via skill, JWT)
```

---

## Migration Waves

### Wave 1: Security Foundation (IN PROGRESS)
- Remove public Gateway exposure from nginx config
- Document current architecture (this file)
- Establish baseline tests

### Wave 2: Decouple Agent Lifecycle (TODO)
- Remove `createOpenClawAgent()` from onboarding.ts
- Remove agent creation calls in `acceptInvite()`
- Remove OpenClaw config from settings routes
- Update tests to remove agent creation expectations

### Wave 3: Clean Schema (TODO)
- Migration: Remove OpenClaw columns from `team_settings`
- Migration: Repurpose or remove agent status fields in `user_onboarding`
- Update seed data and test fixtures

### Wave 4: Verification (TODO)
- Run full test suite
- Test onboarding flow without agent creation
- Test PA interaction via skill (Gateway → Backend)
- Deploy to staging and verify functionality

---

## Success Criteria

1. **No public Gateway exposure**: `curl https://app.mypa.chat/v1/models` returns 403
2. **No agent lifecycle code**: No `POST /v1/agents` calls in backend
3. **No Gateway credentials in DB**: No `openclawToken` in `team_settings`
4. **All tests pass**: 537+ tests passing (excluding known flaky tests)
5. **Onboarding works**: Users can join team without agent creation logic
6. **PA interaction works**: OpenClaw can call MyPA API via skill

---

## Open Questions

1. **Agent ID storage**: Should we keep `users.openclawAgentId`?
   - Pros: Useful for user-agent mapping in logs/analytics
   - Cons: Implies MyPA manages agents (architectural lie)
   - Decision: TBD (not blocking Wave 1)

2. **Onboarding status fields**: Should we repurpose `assistantCreated`/`assistantConfigured`?
   - Could track "first PA interaction" instead of agent creation
   - Or remove entirely as not MyPA's concern
   - Decision: TBD (not blocking Wave 1)

3. **Team context**: How does OpenClaw get team-specific context?
   - Option A: Query via MyPA API (`GET /api/pa/context`)
   - Option B: Store in OpenClaw's own config
   - Decision: Option A (already implemented in pa.ts)

---

## References

- **Execution Plan**: `/Volumes/5T Speedy/Coding Projects/team-sync/docs/OPENCLAW_BOUNDARY_EXECUTION.md`
- **Architecture Doc**: `CLAUDE.md` (project instructions)
- **OpenClaw Skill**: `~/.openclaw/workspace-vasil/skills/mypa/SKILL.md`
- **Bridge Implementation**: `frontend/src/services/openclawBridge.ts`
