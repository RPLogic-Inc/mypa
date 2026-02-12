# FINAL MyPA Deployment Plan - Launch Ready

**Date:** February 8, 2026
**Launch:** TODAY
**Users:** 22 users across 4 teams

---

## ✅ Cost Clarifications - REVISED

### What We Thought

**Original estimate:** $900-1,040/month ❌

### What It Actually Is

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| **DigitalOcean 4GB Droplet** | $24 | Infrastructure |
| **Bandwidth** | $0 | 1TB included |
| **OpenAI API (Whisper only)** | $40 | ~$1.80/user × 22 users |
| **Claude API** | $0 | ✅ **Covered by Claude Max subscription!** |
| **Google Workspace (on-demand)** | $0-154 | $7/user as users onboard |

**TOTAL: ~$64-218/month** ($64 initially, scales with Google Workspace adoption)

**Compared to original:** **MUCH CHEAPER!** (was $900/mo estimate)

---

## 🎯 Launch Configuration

### Teams & Users
- **4 teams, 22 users total**
- Team sizes: 3, 10, and others
- Launch: All users TODAY (full rollout)

### Services to Deploy
1. ✅ **MyPA Backend** - API + database
2. ✅ **MyPA Frontend** - React PWA
3. ✅ **OpenClaw Gateway** - AI runtime (uses Claude Max subscription)
4. ✅ **PA Workspace Backend** - Google Workspace integration
5. ✅ **Nginx + SSL** - Reverse proxy for all services

### Onboarding Flow (Web GUI)

**MyPA already has onboarding system!** Located at:
- Backend: `backend/src/routes/onboarding.ts`
- Frontend: Needs web GUI component (currently backend-only)

**Onboarding steps tracked:**
1. `profileCompleted` - User fills out profile
2. `notificationsConfigured` - Sets notification preferences
3. `assistantCreated` - OpenClaw agent provisioned
4. `assistantConfigured` - PA preferences set
5. `teamTourCompleted` - Product tour finished

**Integration point for PA Workspace:**
- During `assistantCreated` step → Provision Google Workspace account
- Call: `POST /api/pa-workspace/identity/provision`
- Creates: `firstname-pa@pa.mypa.chat` account

---

## 📋 PRE-DEPLOYMENT CHECKLIST (DO FIRST!)

### 1. Google Admin SDK Setup (CRITICAL)

**Status:** ❌ NOT set up yet (REQUIRED before deployment)

**Steps:**

#### A. Create Google Cloud Project

```bash
# Install gcloud if needed
brew install google-cloud-sdk

# Authenticate
gcloud auth login

# Create project
gcloud projects create mypa-workspace-prod --name="MyPA Workspace"
gcloud config set project mypa-workspace-prod

# Enable billing (required for APIs)
gcloud beta billing accounts list
# Note billing account ID
gcloud beta billing projects link mypa-workspace-prod \
  --billing-account=<YOUR_BILLING_ACCOUNT_ID>
```

#### B. Enable Required APIs

```bash
gcloud services enable admin.googleapis.com
gcloud services enable gmail.googleapis.com
gcloud services enable calendar-json.googleapis.com
gcloud services enable drive.googleapis.com
```

#### C. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create mypa-workspace-sa \
  --display-name="MyPA Workspace Service Account" \
  --description="Service account for provisioning PA Google Workspace accounts"

# Get service account email
SA_EMAIL=$(gcloud iam service-accounts list \
  --filter="displayName:MyPA Workspace Service Account" \
  --format="value(email)")

echo "Service account email: $SA_EMAIL"
# Will be: mypa-workspace-sa@mypa-workspace-prod.iam.gserviceaccount.com
```

#### D. Download Service Account Key

```bash
# Create and download key
gcloud iam service-accounts keys create ~/mypa-workspace-sa-key.json \
  --iam-account=$SA_EMAIL

# Verify key file
cat ~/mypa-workspace-sa-key.json | jq '.client_email'

# Store in 1Password for safekeeping
op document create ~/mypa-workspace-sa-key.json \
  --title="MyPA Workspace Service Account Key" \
  --vault=Private \
  --tags=mypa,google-workspace,production

# Copy to deployment location
mkdir -p "/Volumes/5T Speedy/Coding Projects/team-sync/backend/secrets"
cp ~/mypa-workspace-sa-key.json "/Volumes/5T Speedy/Coding Projects/team-sync/backend/secrets/"

# Secure it
chmod 600 "/Volumes/5T Speedy/Coding Projects/team-sync/backend/secrets/mypa-workspace-sa-key.json"
```

#### E. Configure Domain-Wide Delegation (Manual)

**⚠️ REQUIRES Google Workspace Super Admin Access**

1. Go to: https://admin.google.com/ac/owl/domainwidedelegation

2. Click **"Add new"**

3. Get Client ID from service account key:
   ```bash
   cat ~/mypa-workspace-sa-key.json | jq -r '.client_id'
   ```

4. Enter Client ID in Google Admin Console

5. Add OAuth Scopes (paste exactly):
   ```
   https://www.googleapis.com/auth/admin.directory.user,https://www.googleapis.com/auth/admin.directory.group,https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events
   ```

6. Click **"Authorize"**

7. Verify delegation is active (may take a few minutes)

#### F. Decide on PA Domain Strategy

**DECISION NEEDED:** How to structure PA email accounts?

**Option A: Separate Google Workspace (Recommended)**
- Purchase second Google Workspace: pa.mypa.chat
- Cost: $7/user/month as users onboard
- Benefit: Each PA is a real Google user (email, calendar, drive, voice)
- Setup: Purchase via https://workspace.google.com/

**Option B: Aliases in existing Workspace**
- Use existing mypa.chat domain
- Create aliases: alice-pa@mypa.chat
- Cost: $0 (no new accounts)
- Limitation: Aliases can't use all features (no separate calendar, limited API access)

**Recommended:** **Option A** (separate workspace for pa.mypa.chat)

**If Option A:**
```bash
# After purchasing pa.mypa.chat workspace:
# Update PA Workspace config to use pa.mypa.chat domain
# Point DNS for pa.mypa.chat to Google Workspace MX records
```

### 2. Get API Keys from 1Password

```bash
# Authenticate with 1Password CLI
eval $(op signin)

# Get Anthropic API key (for Claude Max subscription)
op read "op://Private/Anthropic/api_key"

# Get OpenAI API key (for Whisper)
op read "op://Private/OpenAI/api_key"

# Get DigitalOcean API token
op read "op://Private/DigitalOcean/api_token"
```

### 3. Verify Domains

**Required DNS records:**

| Record | Type | Value | Status |
|--------|------|-------|--------|
| app.mypa.chat | A | <DROPLET_IP> | ⏳ Will set after droplet created |
| api.mypa.chat | A | <DROPLET_IP> | ⏳ Will set after droplet created |
| oc.mypa.chat | A | <DROPLET_IP> | ⏳ Will set after droplet created |
| pa.mypa.chat | MX | Google Workspace | ⏳ If using Option A for PA accounts |

---

## 🚀 DEPLOYMENT SEQUENCE

### Phase 0: Pre-Deploy Setup (30-45 minutes)

**Run on local machine:**

```bash
# 1. Set up Google Admin SDK (see checklist above)
# 2. Get API keys from 1Password
# 3. Store service account key securely
```

### Phase 1: Create DigitalOcean Droplet (5 minutes)

```bash
# Authenticate with doctl
eval $(op signin)
op read "op://Private/DigitalOcean/api_token" | doctl auth init --access-token -

# Upload SSH key
doctl compute ssh-key import mypa-deploy-key --public-key-file ~/.ssh/id_ed25519.pub || echo "Key already exists"

# Create droplet
SSH_KEY_FP=$(doctl compute ssh-key list --format FingerPrint --no-header | head -1)
doctl compute droplet create mypa-prod-01 \
  --region nyc3 \
  --size s-2vcpu-4gb \
  --image ubuntu-24-04-x64 \
  --ssh-keys $SSH_KEY_FP \
  --tag-names mypa,production \
  --wait

# Get droplet IP
export DROPLET_IP=$(doctl compute droplet list mypa-prod-01 --format PublicIPv4 --no-header)
echo "Droplet IP: $DROPLET_IP"
```

### Phase 2: Configure DNS (2-5 minutes)

```bash
# Create A records for all three domains
doctl compute domain records create mypa.chat \
  --record-type A --record-name app --record-data $DROPLET_IP --record-ttl 3600

doctl compute domain records create mypa.chat \
  --record-type A --record-name api --record-data $DROPLET_IP --record-ttl 3600

doctl compute domain records create mypa.chat \
  --record-type A --record-name oc --record-data $DROPLET_IP --record-ttl 3600

# Wait for DNS propagation
echo "Waiting for DNS to propagate..."
while ! dig +short app.mypa.chat | grep -q "$DROPLET_IP"; do
  echo "Still waiting..."
  sleep 10
done
echo "✓ DNS propagated"
```

### Phase 3: Server Setup (10-15 minutes)

```bash
cd /Volumes/5T\ Speedy/Coding\ Projects/team-sync/deploy

# Upload and run server setup script
scp fresh-server-setup.sh root@$DROPLET_IP:/root/
ssh root@$DROPLET_IP "bash /root/fresh-server-setup.sh"

# This installs: Node.js 20, PM2, nginx, certbot, sqlite3, UFW
```

### Phase 4: Install OpenClaw Gateway (10-15 minutes)

**⚠️ Manual step required** (until OpenClaw provides automated installer)

```bash
ssh root@$DROPLET_IP

# Download OpenClaw binary (adjust URL to latest release)
cd /opt
wget https://github.com/anthropics/openclaw/releases/download/v1.x.x/openclaw-linux-x64.tar.gz
tar xzf openclaw-linux-x64.tar.gz
mv openclaw-linux-x64 openclaw
chmod +x /opt/openclaw/openclaw

# Create openclaw user
useradd -r -s /bin/bash -d /home/openclaw -m openclaw

# Initialize
su - openclaw
/opt/openclaw/openclaw init
# NOTE the Gateway auth token from ~/.openclaw/openclaw.json

# Create PM2 config
cat > openclaw-pm2.config.cjs <<'EOF'
module.exports = {
  apps: [{
    name: 'openclaw-gateway',
    script: '/opt/openclaw/openclaw',
    args: 'gateway start',
    cwd: '/home/openclaw',
    autorestart: true,
    env: { NODE_ENV: 'production', OPENCLAW_PORT: 18789 }
  }]
};
EOF

pm2 start openclaw-pm2.config.cjs
pm2 save
pm2 startup  # Follow instructions
exit  # Back to root
exit  # Back to local
```

### Phase 5: Deploy via Automated Script (15-20 minutes)

```bash
cd /Volumes/5T\ Speedy/Coding\ Projects/team-sync/deploy

# Get API keys
export OPENAI_API_KEY=$(op read "op://Private/OpenAI/api_key")
export ANTHROPIC_API_KEY=$(op read "op://Private/Anthropic/api_key")

# Run automated deployment
./quick-deploy.sh

# This will:
# - Upload nginx configs
# - Generate SSL certificates
# - Create backend .env with all credentials
# - Configure GitHub secrets for CI/CD
# - Set up PA Workspace .env
```

### Phase 6: Deploy PA Workspace (10 minutes)

```bash
ssh root@$DROPLET_IP

# Clone PA Workspace
cd /var/mypa
git clone https://github.com/ragurob/pa-workspace.git
cd pa-workspace
npm ci
npx tsc

# Upload service account key
exit  # Back to local
scp backend/secrets/mypa-workspace-sa-key.json root@$DROPLET_IP:/var/mypa/pa-workspace/service-account.json
ssh root@$DROPLET_IP

# Create .env
cd /var/mypa/pa-workspace
cat > .env <<EOF
PORT=3003
NODE_ENV=production
DATABASE_URL=file:/var/mypa/data/pa-workspace.db
JWT_SECRET=$(grep JWT_SECRET /var/mypa/backend/.env | cut -d= -f2)

# Google Workspace
GOOGLE_ADMIN_EMAIL=admin@mypa.chat
GOOGLE_DOMAIN=pa.mypa.chat
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/var/mypa/pa-workspace/service-account.json

# MyPA Integration
MYPA_API_URL=https://api.mypa.chat/api
EOF

# Start with PM2
pm2 start ecosystem.config.cjs --env production
pm2 save
```

### Phase 7: Deploy MyPA via GitHub Actions (5-10 minutes)

```bash
cd /Volumes/5T\ Speedy/Coding\ Projects/team-sync

# Trigger deployment
git push origin main

# Watch deployment
gh run watch

# Wait for:
# ✓ Tests pass
# ✓ Build succeeds
# ✓ Backend deploys
# ✓ Frontend deploys
# ✓ Health checks pass
```

### Phase 8: Verify Deployment (5 minutes)

```bash
# Check services
ssh root@$DROPLET_IP pm2 list
# Should show: mypa-api, openclaw-gateway, pa-workspace-api (all online)

# Check health endpoints
curl https://app.mypa.chat/api/health
curl https://app.mypa.chat/api/pa-workspace/health

# Test frontend
curl -I https://app.mypa.chat
# Should return: HTTP/2 200
```

### Phase 9: Create Admin User (2 minutes)

```bash
# Create first admin user
curl -X POST https://app.mypa.chat/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@mypa.chat",
    "password": "CHANGE_THIS_SECURE_PASSWORD",
    "name": "Admin User",
    "teamName": "Core Team"
  }'

# Save the returned JWT token
```

### Phase 10: Create Team Invites (5 minutes)

```bash
# Log in as admin
ADMIN_TOKEN="<token-from-above>"

# Create 4 team invite codes (one per team)
for i in 1 2 3 4; do
  curl -X POST https://app.mypa.chat/api/onboarding/invites \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{
      "teamId": "<team-uuid>",
      "maxUses": 10,
      "expiresInDays": 30,
      "openclawConfig": {
        "createAgent": true,
        "enabledTools": ["mypa", "web-search", "github"]
      }
    }'
done

# Share invite codes with team members
```

---

## 🎨 Web Onboarding GUI (Needs Implementation)

**Current state:** Backend onboarding API exists, frontend GUI missing

**Required frontend component:** `frontend/src/components/onboarding/OnboardingWizard.tsx`

**Steps to show:**

1. **Profile Setup**
   - Name, department, avatar upload
   - Skills selection
   - Team selection (if multi-team)

2. **Notification Preferences**
   - Push notification toggle
   - Digest time selection
   - Urgency settings

3. **PA Assistant Creation** ← **PA WORKSPACE PROVISION HERE**
   - PA name customization
   - Voice selection (for TTS)
   - Initial personality prompt
   - **Trigger:** `POST /api/pa-workspace/identity/provision`

4. **PA Configuration**
   - Enable/disable features (web search, GitHub, calendar, email)
   - Set response style (concise/balanced/detailed)
   - Set thinking level (quick/balanced/thorough)
   - **If email/calendar enabled:** Prompt for Google Calendar sharing

5. **Product Tour**
   - Stream tab overview
   - AI chat demo
   - Library of Context demo
   - Send first tez

**Integration with PA Workspace:**

```typescript
// In step 3 (PA Assistant Creation)
async function provisionPAWorkspace(userId: string, userName: string) {
  // Call PA Workspace API
  const response = await fetch('/api/pa-workspace/identity/provision', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      userId,
      userName,
      // PA email will be: firstname-pa@pa.mypa.chat
    })
  });

  const { paIdentity } = await response.json();

  // Update user_onboarding.assistantCreated = true
  // Store paIdentity.paEmail in users table

  return paIdentity;
}
```

**Frontend TODO:**
- Create OnboardingWizard component
- Add to App.tsx routing
- Show on first login (check `user_onboarding` status)
- Track progress (5 steps)
- Celebrate completion 🎉

---

## 📊 Post-Deployment

### Monitoring

```bash
# Set up uptime monitoring
# - UptimeRobot: https://app.mypa.chat/api/health (every 5 min)
# - Alert email: admin@mypa.chat

# Set up log monitoring
ssh root@$DROPLET_IP
pm2 install pm2-logrotate  # Already done in setup
pm2 logs --lines 50  # View all logs
```

### Backups

```bash
# Set up 6-hourly database backups
ssh root@$DROPLET_IP
crontab -e

# Add:
0 */6 * * * tar czf /var/mypa/backups/mypa-$(date +\%Y\%m\%d-\%H\%M).tar.gz /var/mypa/data/*.db && find /var/mypa/backups -name "*.tar.gz" -mtime +30 -delete
```

### User Onboarding

1. **Share invite codes** with 22 users
2. **Monitor onboarding completion** via admin dashboard
3. **Help users** set up calendar sharing (Google Calendar → Share with firstname-pa@pa.mypa.chat)
4. **Track PA Workspace provisioning** (should happen automatically during onboarding)

---

## 🐛 Troubleshooting

### PA Workspace provisioning fails

```bash
# Check service account permissions
ssh root@$DROPLET_IP
cat /var/mypa/pa-workspace/service-account.json | jq '.client_email'

# Test Admin SDK connectivity
cd /var/mypa/pa-workspace
npm run test:admin  # If test script exists

# Check logs
pm2 logs pa-workspace-api --lines 50
```

### OpenClaw Gateway not connecting

```bash
# Check Gateway status
ssh root@$DROPLET_IP
pm2 logs openclaw-gateway

# Get auth token
su - openclaw
cat ~/.openclaw/openclaw.json | grep token

# Verify nginx has correct token
exit
cat /etc/nginx/snippets/openclaw-auth.conf
```

### SSL certificate issues

```bash
# Check certificates
ssh root@$DROPLET_IP
certbot certificates

# Renew manually if needed
certbot renew --force-renewal
nginx -t && systemctl reload nginx
```

---

## ✅ Success Criteria

- [ ] All 4 domains resolve to droplet IP
- [ ] SSL certificates valid for all 4 domains
- [ ] PM2 shows 3 services online (mypa-api, openclaw-gateway, pa-workspace-api)
- [ ] Health endpoints return 200 OK
- [ ] Admin user can log in
- [ ] First test user can complete onboarding
- [ ] PA Workspace provisions Google account on onboarding
- [ ] User receives email at firstname-pa@pa.mypa.chat
- [ ] User can send/receive tezits
- [ ] OpenClaw PA chat works
- [ ] Library search returns results

---

## 📝 Final Cost Summary

**Monthly costs (22 users):**
- Infrastructure: $24
- OpenAI (Whisper): $40
- Claude: $0 (Max subscription)
- Google Workspace: $0-154 (on-demand, $7/user)

**Total: $64-218/month**

**Compared to original estimate:** **92% cheaper!** ($64 vs $900)

**Per user: $2.91-9.91/month** (vs original $45/user)

---

**READY TO DEPLOY? Confirm you've completed Pre-Deployment Checklist!**
