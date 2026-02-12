# OpenClaw Boundary Hardening - Rollout Plan

**Branch:** `feat/openclaw-boundary-final`
**Target Server:** 192.241.135.43 (app.mypa.chat)
**Risk Level:** Medium (security improvements, architectural changes)
**Rollback Time:** < 5 minutes

---

## Pre-Deployment Checklist

- [ ] All tests passing on branch (553+ tests)
- [ ] Security boundary tests passing (12 tests)
- [ ] Smoke tests passing locally
- [ ] Branch merged to main (or deploying from feature branch)
- [ ] Server backup created
- [ ] OpenClaw Gateway is NOT running (to avoid confusion during deployment)

---

## Stage A: Backend + Nginx (Security Fixes)

**Duration:** ~10 minutes
**Impact:** PA chat will be unavailable during this stage
**Rollback:** Available

### Pre-Stage Backup

```bash
# SSH to server
ssh root@192.241.135.43

# Backup current nginx config
sudo cp /etc/nginx/sites-enabled/mypa-app.conf /tmp/mypa-app.conf.backup.$(date +%s)

# Backup current backend
cd /var/mypa/backend
tar -czf /tmp/backend-backup-$(date +%s).tar.gz dist/ package.json package-lock.json

# Note: Don't backup .env (contains secrets)
```

### Backend Deployment

```bash
# On server
cd /var/mypa/backend

# Pull latest changes
git fetch origin
git checkout feat/openclaw-boundary-final  # Or main if merged
git pull

# Install dependencies (in case anything changed)
npm ci

# Build TypeScript
npx tsc

# Verify build succeeded
ls -la dist/

# Update environment variables (if needed)
nano .env
# Ensure these are set:
# OPENCLAW_INTEGRATION_MODE=optional
# OPENCLAW_URL=http://localhost:18789
# OPENCLAW_TOKEN=<your-token>  # Get from 1Password if needed

# Restart backend
pm2 restart mypa-api

# Check logs
pm2 logs mypa-api --lines 50
```

### Nginx Deployment

**Note:** The nginx config has already been updated in the feature branch. We just need to reload.

```bash
# Verify config is correct
cat /etc/nginx/sites-enabled/mypa-app.conf | grep "location /v1/"
# Should see: return 403 "Direct Gateway access forbidden..."

# Test nginx config syntax
sudo nginx -t

# If test passes, reload nginx
sudo nginx -s reload

# If test fails, restore backup:
# sudo cp /tmp/mypa-app.conf.backup.TIMESTAMP /etc/nginx/sites-enabled/mypa-app.conf
# sudo nginx -s reload
```

### Stage A Verification

```bash
# Run smoke tests from local machine
./deploy/smoke-test.sh https://app.mypa.chat

# Expected output:
# ✓ Health endpoint returns 200 OK
# ✓ PA context correctly returns 401 without auth
# ✓ Gateway access correctly blocked (403)
# ✓ OpenClaw proxy correctly returns 401 without auth
# ✓ Frontend loads successfully

# Check backend logs for errors
pm2 logs mypa-api --lines 100 | grep -i error
```

### Stage A Rollback (if needed)

```bash
# Restore nginx config
sudo cp /tmp/mypa-app.conf.backup.TIMESTAMP /etc/nginx/sites-enabled/mypa-app.conf
sudo nginx -s reload

# Restore backend
cd /var/mypa/backend
git checkout HEAD~7  # Go back 7 commits (before this branch)
npx tsc
pm2 restart mypa-api

# Verify rollback
curl -i https://app.mypa.chat/health/live  # Should return 200
```

**Stage A Complete:** Monitor for 2 hours before proceeding to Stage B.

---

## Stage B: Frontend (UX + Bridge Changes)

**Duration:** ~5 minutes
**Impact:** Minimal (static file swap)
**Rollback:** Available

### Pre-Stage Backup

```bash
# On server
cd /var/mypa/frontend
tar -czf /tmp/frontend-backup-$(date +%s).tar.gz dist/
```

### Frontend Build (Local Machine)

```bash
# On local machine
cd /Volumes/5T\ Speedy/Coding\ Projects/team-sync/frontend

# Build with production settings
VITE_APP_NAME="MyPA" \
VITE_APP_SLUG="mypa" \
VITE_API_URL="https://app.mypa.chat/api" \
npm run build

# Verify build output
ls -lah dist/
# Should see index.html, assets/, etc.

# Create tarball for upload
cd dist
tar -czf ../frontend-dist.tar.gz .
cd ..

# Upload to server
scp frontend-dist.tar.gz root@192.241.135.43:/tmp/
```

### Frontend Deployment (Server)

```bash
# On server
cd /var/mypa/frontend/dist

# Extract new build
tar -xzf /tmp/frontend-dist.tar.gz

# Verify extraction
ls -la
# Should see fresh index.html with recent timestamp

# No service restart needed (static files)
```

### Stage B Verification

**Browser Tests (Manual):**

1. **Login test:**
   - Go to https://app.mypa.chat
   - Log in with test account: test@test.com / testtest1
   - Should succeed

2. **PA chat test:**
   - Go to AI tab
   - Send a message to PA
   - Should get "OpenClaw unavailable" error (expected - Gateway not running)
   - OR if Gateway is running: should get response

3. **Voice recording test:**
   - Tap compose (+ button)
   - Record voice message
   - Should see quick-send dialog with 3 buttons
   - Tap "Save for me"
   - Should create personal Tez

4. **Tez quick actions test:**
   - Tap any Tez to expand
   - Scroll down
   - Should see "Quick Actions" section
   - Should see "Ask PA" button

5. **Stream hover test:**
   - Hover over any Tez in stream
   - Should see violet floating button (top-right)
   - Click button
   - Should navigate to AI tab

**Console check:**
- Open browser DevTools (F12)
- Check for errors in Console tab
- Should see no red errors
- May see UX metric logs (expected)

### Stage B Rollback (if needed)

```bash
# On server
cd /var/mypa/frontend
rm -rf dist/
tar -xzf /tmp/frontend-backup-TIMESTAMP.tar.gz
```

**Stage B Complete:** Monitor for 24 hours.

---

## Post-Deployment Monitoring

### First 2 Hours (Critical Window)

**Watch these metrics:**

1. **Backend errors:**
```bash
pm2 logs mypa-api --lines 200 | grep -i "error\|fail\|exception"
```

2. **Nginx errors:**
```bash
sudo tail -f /var/log/nginx/error.log
```

3. **403 responses (should spike):**
```bash
sudo tail -f /var/log/nginx/access.log | grep " 403 "
```

4. **401 responses (expected for unauthenticated):**
```bash
sudo tail -f /var/log/nginx/access.log | grep " 401 "
```

5. **5xx responses (should be 0):**
```bash
sudo tail -f /var/log/nginx/access.log | grep " 5[0-9][0-9] "
```

### First 24 Hours (Stability Window)

**Check daily:**
- Backend uptime: `pm2 list`
- Error rate: `pm2 logs mypa-api --lines 1000 | grep -c "error"`
- Test user login: Manual browser test
- PA chat: Manual browser test (if Gateway running)

**Acceptance criteria:**
- No elevated 5xx error rate
- No authentication failures for valid users
- PA chat works when Gateway is running
- Voice recording → quick-send works
- Tez quick actions work
- No console errors in browser

---

## Rollback Decision Matrix

| Issue | Severity | Action |
|-------|----------|--------|
| Backend won't start | CRITICAL | Rollback Stage A immediately |
| 5xx errors > 5% | HIGH | Investigate logs, rollback if no quick fix |
| 403 errors on `/api/*` | HIGH | Nginx config issue, rollback Stage A |
| PA chat broken (auth) | MEDIUM | Check JWT tokens, may rollback Stage B |
| Voice quick-send broken | MEDIUM | Rollback Stage B |
| UX elements missing | LOW | Rollback Stage B if critical, otherwise patch |

---

## Success Criteria

**Technical:**
- [ ] Backend running for 24h without crashes
- [ ] 5xx error rate < 1%
- [ ] All authenticated endpoints return 401 without JWT
- [ ] `/v1/*` endpoints return 403
- [ ] PA chat works with JWT auth
- [ ] Voice quick-send dialog appears

**Security:**
- [ ] No direct Gateway access possible
- [ ] Browser JavaScript never sees Gateway token
- [ ] Database contains no OpenClaw tokens
- [ ] Rate limiting enforced on proxy

**UX:**
- [ ] Voice-to-send: 2 taps ✓
- [ ] Card-to-PA: 1 tap ✓
- [ ] Stream-to-PA: 1 tap ✓

---

## Post-Rollout Cleanup (After 30 Days Stable)

```bash
# Remove deprecated database column
cd /var/mypa/backend
sqlite3 /var/mypa/data/mypa.db
```

```sql
-- Check if any rows have non-null deprecated tokens
SELECT COUNT(*) FROM team_settings WHERE deprecated_openclaw_token IS NOT NULL;

-- If 0, safe to drop
ALTER TABLE team_settings DROP COLUMN deprecated_openclaw_token;
```

```bash
# Remove legacy code
# Delete createOpenClawAgent function entirely
# Remove OPENCLAW_INTEGRATION_MODE=legacy support
```

---

## Emergency Contacts

- **Server Access:** Root SSH key in 1Password ("DigitalOcean Root SSH")
- **OpenClaw Token:** 1Password ("OpenClaw Gateway Token")
- **Backend Logs:** `pm2 logs mypa-api`
- **Nginx Logs:** `/var/log/nginx/error.log`, `/var/log/nginx/access.log`
- **Database:** `/var/mypa/data/mypa.db` (SQLite)

---

## Notes

- This deployment DOES NOT require OpenClaw Gateway to be running
- PA chat will show "unavailable" if Gateway is not running (expected)
- The security boundary changes are independent of Gateway availability
- Voice recording and Tez CRUD work without OpenClaw
