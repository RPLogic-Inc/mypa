# MyPA.chat Completion Checklist

**Goal:** Deploy working MyPA.chat with OpenClaw boundary hardening, ready for testing.

---

## Pre-Deployment (Today)

### 1. Commit Remaining Changes
- [ ] Review uncommitted files:
  ```bash
  git status
  git diff backend/src/services/onboarding.ts
  git diff backend/src/routes/settings.ts
  git diff frontend/src/components/tez/TezExpanded.tsx
  ```
- [ ] Stage documentation:
  ```bash
  git add docs/UI_MODE_AND_MULTI_TEAM_PLAN.md
  ```
- [ ] Commit or stash uncommitted changes
- [ ] Push feature branch to GitHub

### 2. Run Local Tests
- [ ] Backend tests:
  ```bash
  cd backend && npm test
  ```
  - Expected: 558 passing, 2 skipped
- [ ] Frontend build:
  ```bash
  cd frontend && npm run build
  ```
  - Expected: Clean build, no errors
- [ ] Smoke tests (local):
  ```bash
  ./deploy/smoke-test.sh http://localhost:3001
  ```

### 3. Merge to Main (or Deploy from Feature Branch)
**Decision:** Deploy from `feat/openclaw-boundary-final` OR merge to main first?

**Option A: Deploy from feature branch** (faster, can rollback easily)
- Pros: Test in production before merging
- Cons: Main branch diverges from production

**Option B: Merge to main first** (cleaner)
```bash
git checkout mypa-ci-cd
git merge feat/openclaw-boundary-final
git push origin mypa-ci-cd
```

---

## Stage A: Backend + Nginx Deployment (2 Hours)

**Follow:** `deploy/ROLLOUT_PLAN.md` - Stage A

### Pre-Stage Backup
```bash
ssh root@192.241.135.43

# Backup nginx config
sudo cp /etc/nginx/sites-enabled/mypa-app.conf /tmp/mypa-app.conf.backup.$(date +%s)

# Backup backend
cd /var/mypa/backend
tar -czf /tmp/backend-backup-$(date +%s).tar.gz dist/ package.json package-lock.json
```

### Deploy Backend
```bash
# On server
cd /var/mypa/backend
git fetch origin
git checkout feat/openclaw-boundary-final  # or main if merged
git pull

# Build
npm ci
npx tsc

# Verify .env
cat .env | grep OPENCLAW_INTEGRATION_MODE
# Should be: OPENCLAW_INTEGRATION_MODE=optional

# Restart
pm2 restart mypa-api
pm2 logs mypa-api --lines 50
```

### Verify Nginx Config
```bash
# Check nginx config
cat /etc/nginx/sites-enabled/mypa-app.conf | grep "location /v1/"
# Should see: return 403 "Direct Gateway access forbidden..."

# Test config
sudo nginx -t

# Reload
sudo nginx -s reload
```

### Stage A Verification
```bash
# From local machine
./deploy/smoke-test.sh https://app.mypa.chat

# Expected output:
# ✓ Health endpoint returns 200 OK
# ✓ PA context correctly returns 401 without auth
# ✓ Gateway access correctly blocked (403)
# ✓ OpenClaw proxy correctly returns 401 without auth
# ✓ Frontend loads successfully
```

**Monitor for 2 hours:**
- [ ] Check PM2 logs: `pm2 logs mypa-api --lines 200 | grep -i error`
- [ ] Check nginx errors: `sudo tail -f /var/log/nginx/error.log`
- [ ] Check 403 responses: `sudo tail -f /var/log/nginx/access.log | grep " 403 "`

**Acceptance criteria:**
- [ ] No 5xx errors
- [ ] Backend responds to /health/live
- [ ] Direct /v1/* access returns 403
- [ ] Authenticated endpoints require JWT

---

## Stage B: Frontend Deployment (30 Minutes)

**Only proceed if Stage A stable for 2+ hours**

### Build Frontend (Local)
```bash
cd /Volumes/5T\ Speedy/Coding\ Projects/team-sync/frontend

VITE_APP_NAME="MyPA" \
VITE_APP_SLUG="mypa" \
VITE_API_URL="https://app.mypa.chat/api" \
npm run build

# Create tarball
cd dist
tar -czf ../frontend-dist.tar.gz .
cd ..

# Upload to server
scp frontend-dist.tar.gz root@192.241.135.43:/tmp/
```

### Deploy Frontend (Server)
```bash
# On server
cd /var/mypa/frontend

# Backup
tar -czf /tmp/frontend-backup-$(date +%s).tar.gz dist/

# Deploy
cd dist
tar -xzf /tmp/frontend-dist.tar.gz
```

### Stage B Verification (Manual Browser Tests)

**Test 1: Login**
- [ ] Go to https://app.mypa.chat
- [ ] Login: test@test.com / testtest1
- [ ] Should succeed

**Test 2: PA Chat (if Gateway running)**
- [ ] Go to AI tab
- [ ] Send message to PA
- [ ] Should get response OR "unavailable" error (expected if Gateway not running)

**Test 3: Voice Recording**
- [ ] Tap compose (+) button
- [ ] Record voice message
- [ ] Should see quick-send dialog with 3 buttons
- [ ] Tap "Save for me"
- [ ] Should create personal Tez

**Test 4: Tez Quick Actions**
- [ ] Tap any Tez to expand
- [ ] Scroll down
- [ ] Should see "Quick Actions" section
- [ ] Should see "Ask PA" button

**Test 5: Stream Hover**
- [ ] Hover over any Tez in stream
- [ ] Should see violet floating button (top-right)
- [ ] Click button
- [ ] Should navigate to AI tab

**Test 6: Browser Console**
- [ ] Open DevTools (F12)
- [ ] Check Console tab
- [ ] Should see no red errors
- [ ] May see UX metric logs (expected)

---

## Post-Deployment (24 Hours)

### Monitor
- [ ] Backend uptime: `pm2 list`
- [ ] Error rate: `pm2 logs mypa-api --lines 1000 | grep -c "error"`
- [ ] Test user login (daily)
- [ ] PA chat functionality (if Gateway running)

### Acceptance Criteria
- [ ] No elevated 5xx error rate
- [ ] No authentication failures for valid users
- [ ] PA chat works when Gateway running
- [ ] Voice recording → quick-send works
- [ ] Tez quick actions work
- [ ] No console errors in browser

---

## Success = MyPA.chat v1.0 Deployed ✅

Once stable for 24 hours:
- [ ] Tag release: `git tag v1.0.0-mypa`
- [ ] Document what works:
  - ✅ Tez CRUD (create/read/update/delete)
  - ✅ Team Stream (chronological feed)
  - ✅ Voice recording + quick-send
  - ✅ Library search (FTS5)
  - ✅ OpenClaw integration (authenticated proxy)
  - ✅ Multi-team support (backend ready, UI needs wiring)
  - ✅ Proactive context UI (quick actions, floating buttons)
- [ ] Document what's NOT yet deployed:
  - ⏳ OpenClaw Gateway (manual install required)
  - ⏳ PA Workspace (code complete, not deployed)
  - ⏳ UI mode toggle (planned, not implemented)

---

## Known Issues / Tech Debt

- [ ] OpenClaw Gateway not installed on server (manual step)
- [ ] Multi-team UI needs wiring (backend ready, TeamSwitcher exists but not visible)
- [ ] Some tests failing due to rate limiting (40 tests in skill-contract.test.ts)
- [ ] Database migration for deprecated openclawToken column not yet run

---

## Next: Extract Tezit Protocol

**Only after MyPA.chat is stable and tested.**

See: Phase 2 plan below.
