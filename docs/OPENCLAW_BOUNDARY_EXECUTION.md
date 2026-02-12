# OpenClaw Boundary Hardening - Execution Plan

**Goal:** Establish clean architectural boundary where OpenClaw IS the runtime, MyPA IS the UX/data/team layer.

**Target End State:**
- ✅ MyPA owns: UX, auth, Tez data, context library, team workflows
- ✅ OpenClaw owns: agent runtime, memory, tools, reasoning
- ✅ Zero public shared OpenClaw token paths
- ✅ Zero OpenClaw secrets stored in MyPA DB
- ✅ MyPA backend never creates/manages personal OpenClaw agents
- ✅ UX: fewer clicks than raw OpenClaw for Tez workflows

---

## Execution Sequence

### Wave 1: Security Foundation (Sequential)

#### Phase 1: Branch Setup & Baseline
**Owner:** Primary agent
**Files:** None initially, then `docs/OPENCLAW_BOUNDARY.md`
**Actions:**
1. Create feature branch: `git checkout -b feat/openclaw-boundary-final`
2. Run baseline tests: `cd backend && npm test`
3. Run baseline build: `cd frontend && npm run build`
4. Document current architecture in `OPENCLAW_BOUNDARY.md`

**Verification:**
```bash
npm test -w backend  # Must pass
npm run build -w frontend  # Must pass
git status  # Clean working tree
```

**Exit Gate:** ✅ Baseline artifacts documented, all tests passing

---

#### Phase 2: Remove Public Gateway Exposure (CRITICAL SECURITY FIX)
**Owner:** Security agent
**Files:**
- `deploy/nginx-configs/mypa-app.conf`
- `deploy/nginx-configs/openclaw-gateway.conf`

**Actions:**
1. **Remove** `/v1/` location block from `mypa-app.conf` (lines 75-81)
2. Remove or comment out `openclaw-auth.conf` snippet include
3. Add explicit deny rule:
```nginx
# Block direct OpenClaw Gateway access (use authenticated proxy instead)
location /v1/ {
    return 403 "Direct Gateway access forbidden. Use /api/openclaw/* endpoints.";
}
```

**Verification:**
```bash
# After nginx reload on server
curl -i https://app.mypa.chat/v1/models
# Expected: 403 Forbidden (not 200 OK)

curl -i https://app.mypa.chat/v1/chat/completions -X POST
# Expected: 403 Forbidden
```

**Exit Gate:** ✅ No unauthenticated internet path can spend OpenClaw compute

---

### Wave 2: Backend Refactoring (Parallel Streams)

#### Phase 3: Authenticated OpenClaw Proxy
**Owner:** Backend stream A agent
**Files:**
- `backend/src/routes/openclawProxy.ts` (NEW)
- `backend/src/index.ts` (register route)
- `backend/.env.example` (document pattern)

**Actions:**
1. Create authenticated proxy endpoint:
```typescript
// POST /api/openclaw/chat/completions
// - Requires JWT auth
// - Rate limited (aiRateLimit)
// - Streams to Gateway using server OPENCLAW_TOKEN
// - Never exposes token to client
```

2. Register route in `index.ts`:
```typescript
import { openclawProxyRoutes } from "./routes/openclawProxy.js";
app.use("/api/openclaw", openclawProxyRoutes);
```

3. Add tests in `backend/src/routes/openclawProxy.test.ts`

**Verification:**
```bash
npm test -w backend

# Integration test
curl -i https://app.mypa.chat/api/openclaw/chat/completions
# Expected: 401 without JWT

curl -i https://app.mypa.chat/api/openclaw/chat/completions \
  -H "Authorization: Bearer $VALID_JWT"
# Expected: 200 or streaming response
```

**Exit Gate:** ✅ Only authenticated MyPA users can access OpenClaw runtime from app

---

#### Phase 5: Remove Backend Assistant Lifecycle
**Owner:** Backend stream B agent (parallel with Phase 3)
**Files:**
- `backend/src/services/onboarding.ts`
- `backend/src/routes/onboarding.ts`
- `backend/src/routes/cards.ts`
- Related test files

**Actions:**
1. **Deprecate** `createOpenClawAgent()` function in `onboarding.ts`
   - Add feature flag check: `if (OPENCLAW_INTEGRATION_MODE === 'legacy') { ... }`
   - Default behavior: skip agent creation, log info message

2. **Remove** `/api/onboarding/retry-assistant` endpoint

3. **Update** onboarding flow:
   - Remove `assistantCreated` / `assistantConfigured` steps
   - Update completion percentage calculation
   - Show "Configure PA via OpenClaw" message in UI

4. Update tests to reflect new flow

**Verification:**
```bash
rg -n "createOpenClawAgent|/v1/agents|retry-assistant" backend/src
# Expected: only in deprecated legacy code paths, not in active flows

npm test -w backend
```

**Exit Gate:** ✅ MyPA no longer orchestrates OpenClaw agent lifecycle

---

#### Phase 6: Remove OpenClaw Secret Storage
**Owner:** Backend stream C agent (parallel with Phases 3 & 5)
**Files:**
- `backend/src/db/schema.ts`
- `backend/src/routes/settings.ts`
- `backend/drizzle/000X_remove_openclaw_secrets.sql` (NEW migration)

**Actions:**
1. Create migration to:
   - Log existing `openclawToken` values to console (for admin reference)
   - Rename columns: `openclawToken` → `deprecated_openclawToken`
   - Add comment: "Removed 2026-02-08: OpenClaw tokens now env-only"

2. Update `settings.ts`:
   - Remove `openclawToken` from validation schema
   - Remove token write paths
   - Keep read-only check: `!!process.env.OPENCLAW_TOKEN`

3. Update `/api/settings/integrations/test` endpoint:
   - Only use `process.env.OPENCLAW_TOKEN` (never DB value)

**Verification:**
```bash
npm run db:generate -w backend
npm run db:push -w backend  # On dev DB first

rg -n "openclawToken.*=" backend/src
# Expected: no write assignments, only env reads

npm test -w backend
```

**Exit Gate:** ✅ OpenClaw secrets are env/secret-store only, never in MyPA DB

---

#### Phase 7: Strengthen Data Endpoints (Skill Contract)
**Owner:** Backend stream D agent (parallel with Phases 3, 5, 6)
**Files:**
- `backend/src/routes/pa.ts`
- `backend/src/routes/cards.ts`
- `backend/src/routes/tez.ts`
- `backend/src/routes/library.ts`
- `skills/mypa/SKILL.md`
- `backend/src/tests/skill-contract.test.ts` (NEW)

**Actions:**
1. **Freeze contract** for skill-critical endpoints:
   - `GET /api/pa/context`
   - `GET /api/pa/briefing`
   - `POST /api/cards/personal`
   - `POST /api/cards/team`
   - `GET /api/cards/feed`
   - `POST /api/tez/:id/interrogate`
   - `GET /api/library/search`

2. **Add contract tests** verifying:
   - Response schema stability
   - Status codes (200, 400, 401, 404, 500)
   - Error format consistency
   - Rate limiting behavior

3. **Update SKILL.md** with precise examples for each endpoint

**Verification:**
```bash
npm test -w backend -- skill-contract.test.ts
# All contract tests must pass

npm run test -w backend
```

**Exit Gate:** ✅ OpenClaw skill can fully operate MyPA with stable contract

---

### Wave 3: Frontend Changes (Sequential after Wave 2 Phase 3)

#### Phase 4: Switch Frontend Bridge to Authenticated Proxy
**Owner:** Frontend stream A agent
**Files:**
- `frontend/src/services/openclawBridge.ts`
- `frontend/src/components/pa/PAChat.tsx`

**Actions:**
1. Update `openclawBridge.ts` Canvas Web mode:
```typescript
// OLD: POST https://app.mypa.chat/v1/chat/completions (no auth)
// NEW: POST https://app.mypa.chat/api/openclaw/chat/completions (JWT auth)

const response = await fetch(`${API_URL}/api/openclaw/chat/completions`, {
  headers: {
    'Authorization': `Bearer ${getAccessToken()}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(request)
});
```

2. Add error handling for 401 (token expired) → trigger refresh flow

3. Keep native mode unchanged (`window.__openclaw` direct calls)

**Verification:**
```bash
npm run build -w frontend

# Manual test in browser
# 1. Open app.mypa.chat in browser (not OpenClaw desktop)
# 2. Go to AI tab
# 3. Send a message
# Expected: PA responds via authenticated proxy
```

**Exit Gate:** ✅ OpenClaw chat works end-to-end through secured path

---

#### Phase 8: UX Improvements (Parallel with Phase 4)
**Owner:** Frontend stream B agent
**Files:**
- `frontend/src/components/pa/PAChat.tsx`
- `frontend/src/components/cards/CardExpanded.tsx`
- `frontend/src/components/input/VoiceRecorder.tsx`
- `frontend/src/components/inbox/InboxList.tsx`

**Actions:**
1. **Proactive context chips** on card receive:
   - Show "Ask PA about this" button on every card
   - Show "Send to [TeamName]" quick action
   - Show "Interrogate context" if TIP-eligible

2. **Voice-to-send optimization:**
   - After voice recording, show send confirmation dialog with recipient chips
   - Target: <= 2 taps from voice finish to message sent

3. **One-tap follow-ups:**
   - From expanded card view, add "Ask PA" floating button
   - Prefills PA chat with: "Regarding Tez [ID]: [user question]"

4. **Measure click counts:**
   - Add analytics events (or console logs for testing)
   - Track: voice-to-send taps, card-to-PA taps, card-to-interrogate taps

**KPIs:**
- Voice-to-send: <= 2 taps
- Open received Tez + see proactive context: <= 1 tap
- Ask follow-up question: <= 1 tap

**Verification:**
```bash
npm run build -w frontend

# Manual UX audit
# 1. Record voice message → send to team (count taps)
# 2. Receive card → tap to expand → see proactive actions (count taps)
# 3. From card → ask PA about it (count taps)
```

**Exit Gate:** ✅ Click counts beat baseline OpenClaw UI for Tez workflows

---

### Wave 4: Testing & Deployment (Sequential after Waves 2 & 3)

#### Phase 9: Security & Regression Tests
**Owner:** QA agent
**Files:**
- `backend/src/tests/security.test.ts` (NEW)
- `deploy/smoke-test.sh` (NEW)

**Actions:**
1. **Create security test suite:**
   - Attempt `/v1/*` access without auth → 403
   - Attempt `/api/openclaw/*` without JWT → 401
   - Attempt SQL injection on new endpoints → no effect
   - Attempt to read other user's OpenClaw responses → 403

2. **Create smoke test script:**
```bash
#!/usr/bin/env bash
echo "Running smoke tests..."
curl -i https://app.mypa.chat/health/live  # 200 OK
curl -i https://app.mypa.chat/api/pa/context  # 401
curl -i https://app.mypa.chat/v1/models  # 403 Forbidden
echo "All smoke tests passed ✅"
```

**Verification:**
```bash
npm test -w backend
npm run build -w frontend
./deploy/smoke-test.sh
```

**Exit Gate:** ✅ No critical security or regression findings

---

#### Phase 10: Staged Rollout with Rollback Plan
**Owner:** DevOps agent
**Files:**
- `deploy/rollout-plan.md` (NEW)
- `deploy/rollback.sh` (NEW)

**Actions:**

**Stage A: Backend + Nginx (Security Fixes)**
1. SSH to server
2. Backup current nginx config: `cp /etc/nginx/sites-enabled/mypa-app.conf /tmp/mypa-app.conf.backup`
3. Deploy new nginx config (Phase 2 changes)
4. Reload nginx: `sudo nginx -t && sudo nginx -s reload`
5. Deploy backend with authenticated proxy (Phase 3 changes)
6. Restart backend: `pm2 restart mypa-api`
7. Monitor for 2 hours:
   - Check `/var/log/nginx/error.log` for 403 spikes
   - Check PM2 logs: `pm2 logs mypa-api --lines 100`
   - Watch error rate in backend logs

**Rollback Stage A if needed:**
```bash
sudo cp /tmp/mypa-app.conf.backup /etc/nginx/sites-enabled/mypa-app.conf
sudo nginx -s reload
cd /var/mypa/backend && git checkout HEAD~1 && npx tsc && pm2 restart mypa-api
```

**Stage B: Frontend (UX + Bridge Changes)**
1. Deploy new frontend build (Phases 4 & 8 changes)
2. Copy to server: `scp -r dist/* root@192.241.135.43:/var/mypa/frontend/dist/`
3. Monitor for 24 hours:
   - Test PA chat in browser (app.mypa.chat)
   - Test voice recording → send
   - Check for elevated 401/5xx errors

**Rollback Stage B if needed:**
```bash
# On server
cd /var/mypa/frontend && git checkout HEAD~1
npm run build
# (or restore previous dist/ backup)
```

**Exit Gate:** ✅ Stable for 24h with no elevated 5xx/401 anomalies, click-count KPIs met

---

## Definition of Done

- [ ] OpenClaw is the runtime (MyPA never creates agents)
- [ ] MyPA is the UX/context/team layer (skill-driven)
- [ ] No public shared-token gateway route
- [ ] No OpenClaw token in MyPA DB
- [ ] Click counts on core Tez flows beat raw OpenClaw UX
- [ ] All tests passing (backend + security suite)
- [ ] Deployed to production and stable for 24h
- [ ] Rollback plan tested and documented

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Breaking PA chat for existing users** | Stage A deploys backend proxy first; frontend can fall back to error message if proxy fails |
| **Performance regression (proxy adds latency)** | Benchmark `/api/openclaw/*` vs direct `/v1/*`; ensure < 50ms overhead |
| **Token refresh loop edge case** | Add retry logic in `openclawBridge.ts` with exponential backoff |
| **Migration breaks existing setups** | Migration logs existing tokens to console; admins can manually restore to env if needed |
| **Rollback takes too long** | Pre-stage rollback artifacts in `/tmp/` and document exact commands |

---

## Metrics to Track

**Security:**
- 403 responses on `/v1/*` paths (should be 100% after Phase 2)
- 401 responses on `/api/openclaw/*` without JWT (should be 100%)
- No successful unauthorized OpenClaw calls in logs

**Performance:**
- P95 latency for `/api/openclaw/chat/completions` (baseline: direct `/v1/*`)
- Backend CPU usage (should not increase > 5%)

**UX:**
- Average taps: voice-to-send (target: <= 2)
- Average taps: card-to-PA-question (target: <= 1)
- PA chat success rate (target: >= 99%)

**Reliability:**
- Backend 5xx error rate (baseline: current, target: no increase)
- Frontend error boundary triggers (baseline: current, target: no increase)

---

## Deployment Status

**Documentation:**
- [x] Phase 9: Security tests created and passing
- [x] Phase 10: Rollout plan documented
- [x] Rollback procedures created (< 5 min recovery)
- [x] Smoke test script created

**Deployment Stages:**
- [ ] Stage A: Backend + nginx deployed
- [ ] Stage A: Monitored for 2 hours (stable)
- [ ] Stage B: Frontend deployed
- [ ] Stage B: Monitored for 24 hours (stable)
- [ ] Post-deployment: 30-day cleanup scheduled

**See:** `deploy/ROLLOUT_PLAN.md` for complete deployment procedures.

---

## Next Steps After Completion

1. **Remove legacy code:** After 30 days stable, fully delete deprecated `createOpenClawAgent` code
2. **PA Workspace integration:** Deploy PA Workspace backend (separate module, already complete)
3. **OpenClaw skill enhancements:** Add more tool endpoints (calendar sync, task creation, etc.)
4. **Multi-workspace support:** Allow users to connect multiple OpenClaw workspaces
