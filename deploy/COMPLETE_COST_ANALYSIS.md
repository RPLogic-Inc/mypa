# Complete MyPA Cost & Service Analysis

**Date:** February 8, 2026
**For:** 20 users, 4 teams
**Updated:** Comprehensive breakdown including ALL services

---

## 🚨 Critical Services Missing from Initial Estimate

The initial deployment plan was **incomplete**. Here's what was missing:

1. ❌ **Claude API costs** (OpenClaw uses Claude Sonnet 4.5 for each PA)
2. ❌ **Google Workspace** ($6-7/user/month for PA email/calendar/voice)
3. ⚠️ **OpenAI API costs** (underestimated - includes Whisper + TIP interrogation)
4. ⚠️ **Storage scaling** (Library of Context grows with usage)

---

## 💰 Complete Monthly Cost Breakdown (20 Users)

### Infrastructure

| Service | Details | Monthly Cost |
|---------|---------|--------------|
| **DigitalOcean Droplet** | 4GB RAM, 2 CPU, 80GB SSD | **$24.00** |
| **DigitalOcean Backups** | 20% of droplet (optional) | **$4.80** |
| **Domain** | mypa.chat (annual ÷ 12) | **$1.00** |
| **SSL Certificates** | Let's Encrypt (free) | **$0.00** |
| **Bandwidth** | 1TB included, $0.01/GB over | **$0.00** (likely) |

**Infrastructure Subtotal:** **$29.80/month**

---

### AI Services (Per-User & Aggregate)

#### 1. Claude API (via OpenClaw)

**What it does:** Every PA agent conversation uses Claude Sonnet 4.5

**Pricing (Claude Sonnet 4.5):**
- Input: $15 per 1M tokens (~750k words)
- Output: $75 per 1M tokens (~750k words)

**Usage estimate per user/month:**
- Average session: 30 messages/day × 30 days = 900 messages/month
- Average message length: 200 tokens input, 500 tokens output
- Monthly per user: 180k input tokens + 450k output tokens
- Cost per user: (180k × $15/1M) + (450k × $75/1M) = **$2.70 + $33.75 = $36.45/user**

**For 20 users:** **~$729/month**

**Heavy users (10+ sessions/day):** Could be **$100-150/user/month**

#### 2. OpenAI API (Whisper + TIP)

**What it does:**
- Whisper: Voice transcription for all voice tezits
- GPT-4: Tez Interrogation Protocol (TIP) queries

**Pricing:**
- Whisper: $0.006 per minute
- GPT-4 Turbo: $10 per 1M input tokens, $30 per 1M output tokens

**Usage estimate per user/month:**
- Voice messages: 10 minutes/day × 30 days = 300 minutes
- TIP interrogations: 5 queries/day × 30 days = 150 queries
  - Avg query: 2k tokens input (context) + 500 tokens output
  - Monthly: 300k input + 75k output

**Cost per user:**
- Whisper: 300 min × $0.006 = **$1.80**
- TIP: (300k × $10/1M) + (75k × $30/1M) = **$3.00 + $2.25 = $5.25**
- **Total: $7.05/user**

**For 20 users:** **~$141/month**

**AI Services Subtotal:** **$870/month** (Claude + OpenAI)

---

### Google Workspace (PA Workspace Module)

**What it provisions:** Each user gets their own PA with a real Google Workspace account

**Includes per user:**
- ✉️ Email: `alice-pa@pa.mypa.chat`
- 📅 Calendar: PA's calendar + read user's shared calendar
- 📁 Drive: 30GB storage per PA
- 📞 Google Voice: Phone number for PA (US only)

**Pricing:** $6/user/month (Business Starter) or $7/user/month (with Voice)

**For 20 users:** **$120-140/month**

**⚠️ Critical:** This is **NOT included in the current deployment plan**. PA Workspace deployment requires:
1. Purchase Google Workspace domain (pa.mypa.chat)
2. Set up Google Admin SDK + service account
3. Configure domain-wide delegation
4. Deploy `pa-workspace` backend to port 3003
5. Provision PA accounts via Admin API

**Status:** ❌ **NOT DEPLOYED** (manual setup required)

---

### Storage (Library of Context)

**Current:** SQLite on droplet at `/var/mypa/data/mypa.db`

**Growth projections:**

| Users | Context Entries | DB Size | FTS5 Index | Total | Fits in 80GB? |
|-------|----------------|---------|------------|-------|---------------|
| 5     | 10K            | ~200MB  | ~20MB      | ~220MB| ✅ Yes        |
| 20    | 50K            | ~1GB    | ~100MB     | ~1.1GB| ✅ Yes        |
| 20    | 100K           | ~2GB    | ~200MB     | ~2.2GB| ✅ Yes        |
| 20    | 500K           | ~10GB   | ~1GB       | ~11GB | ✅ Yes        |
| 20    | 1M+            | ~20GB+  | ~2GB+      | ~22GB+| ✅ Yes (70% full) |

**When to upgrade:**

**Option 1: Larger Droplet**
- 8GB/4CPU/160GB SSD: $48/month (+$24)
- Good for: Up to 3M context entries (~50GB DB)

**Option 2: External Volume**
- DigitalOcean Volume: $0.10/GB/month
- 100GB volume: $10/month
- Good for: Isolating data from system, easier backups

**Option 3: Cloud Database**
- Turso (SQLite-compatible): $29/month (500GB)
- PlanetScale (MySQL): $39/month (100GB)
- Good for: Multi-region, automatic backups, no droplet storage

**Current:** Included in droplet (no extra cost)
**Future (>500K entries):** +$10-48/month

---

## 📊 Total Monthly Cost Summary

### Minimal Configuration (Current Deployment)

| Category | Monthly Cost |
|----------|--------------|
| Infrastructure | $29.80 |
| Claude API (20 users, moderate use) | $729.00 |
| OpenAI API (20 users) | $141.00 |
| **TOTAL (without Google Workspace)** | **~$900/month** |

### Full Configuration (with PA Workspace)

| Category | Monthly Cost |
|----------|--------------|
| Infrastructure | $29.80 |
| Claude API (20 users, moderate use) | $729.00 |
| OpenAI API (20 users) | $141.00 |
| Google Workspace (20 PA accounts) | $140.00 |
| **TOTAL (full features)** | **~$1,040/month** |
| **Per User** | **~$52/user/month** |

### Heavy Usage (10+ PA sessions/day per user)

| Category | Monthly Cost |
|----------|--------------|
| Infrastructure | $29.80 |
| Claude API (20 users, heavy use) | $2,000-3,000 |
| OpenAI API (20 users, heavy use) | $300-500 |
| Google Workspace (20 PA accounts) | $140.00 |
| **TOTAL (heavy usage)** | **~$2,500-3,700/month** |
| **Per User** | **~$125-185/user/month** |

---

## 🔍 What's Actually Deployed in Current Plan

### ✅ Included in Current Deployment

1. **Infrastructure**
   - DigitalOcean droplet (4GB/2CPU)
   - Nginx with SSL (Let's Encrypt)
   - PM2 process management
   - SQLite database

2. **MyPA Backend**
   - API server (port 3001)
   - JWT authentication
   - Database with FTS5 search
   - Tez CRUD + Library

3. **MyPA Frontend**
   - React PWA (static)
   - Stream, AI, Library tabs
   - Voice recording
   - OpenClaw integration

4. **OpenClaw Gateway**
   - AI runtime (port 18789)
   - WebSocket for PA chat
   - Canvas Web bridge

### ❌ NOT Included (Manual Setup Required)

1. **PA Workspace Backend**
   - ⚠️ Directory created: `/var/mypa/pa-workspace`
   - ❌ NOT deployed (no PM2 config, no .env, no service)
   - ❌ Google Workspace NOT provisioned
   - ❌ PA email accounts NOT created

2. **Google Workspace Setup**
   - ❌ Domain purchase (pa.mypa.chat)
   - ❌ Google Admin SDK service account
   - ❌ Domain-wide delegation
   - ❌ PA account provisioning

3. **Monitoring & Alerts**
   - ❌ Uptime monitoring (UptimeRobot, Pingdom)
   - ❌ Error tracking (Sentry)
   - ❌ Log aggregation (Papertrail, Logtail)

---

## 📦 What Services Are Used Where

### MyPA Backend (Port 3001)

**Direct API Usage:**
- **OpenAI API:** Whisper transcription (`/api/voice/transcribe`)
- **OpenAI API:** TIP interrogation (`/api/tez/:id/interrogate`)

**Via OpenClaw:**
- **Claude API:** PA chat conversations (proxied through OpenClaw Gateway)
- **Claude API:** Message classification (deterministic, lightweight)

**Database:**
- **SQLite:** All data at `/var/mypa/data/mypa.db`
- **FTS5:** Full-text search index (virtual table)
- **Size:** Grows with context entries (currently <1GB for dev)

### OpenClaw Gateway (Port 18789)

**Direct API Usage:**
- **Claude API (Sonnet 4.5):** Every PA conversation
- **Tool calls:** Can invoke any tool (GitHub, web search, etc.)

**Per-User Isolation:**
- Each user has their own agent session
- Session context stored in OpenClaw memory
- No cross-user data leakage

### PA Workspace (Port 3003) - NOT DEPLOYED

**Would use:**
- **Google Admin SDK:** Provision PA accounts
- **Gmail API:** Read/send PA emails
- **Calendar API:** Manage PA calendar + read user's shared calendar
- **Google Voice API:** Provision phone numbers

**Database:**
- **SQLite:** Separate DB at `/var/mypa/data/pa-workspace.db`
- **Tables:** workspace_config, pa_identities, pa_action_log, email_log

---

## 🎯 Recommendation: What to Deploy

### Option 1: MVP (Minimal Viable Product)

**Deploy NOW:**
- ✅ Infrastructure (droplet, nginx, SSL)
- ✅ MyPA Backend + Frontend
- ✅ OpenClaw Gateway
- ✅ Library of Context (SQLite + FTS5)

**Skip for now:**
- ⏭️ PA Workspace (no Google Workspace costs)
- ⏭️ Monitoring (add after validation)

**Cost:** **~$900/month** (infrastructure + AI)

### Option 2: Full Feature Set

**Deploy everything:**
- ✅ Everything from Option 1
- ✅ PA Workspace Backend
- ✅ Google Workspace provisioning (20 PA accounts)
- ✅ Monitoring + alerts

**Cost:** **~$1,040/month**

### Option 3: Staged Rollout

**Phase 1 (Week 1):** MVP to 5 pilot users
**Cost:** ~$225/month

**Phase 2 (Week 2-3):** Add PA Workspace for pilot
**Cost:** ~$260/month (pilot) + setup time

**Phase 3 (Month 2):** Scale to all 20 users
**Cost:** ~$1,040/month

---

## 🔧 What Needs to Be Fixed in Deployment Plan

### 1. Add PA Workspace Deployment

The plan mentions PA Workspace but doesn't actually deploy it. Need to add:

```bash
# After Phase 4 (MyPA Backend), add Phase 4.5:

# Clone PA Workspace
git clone https://github.com/ragurob/pa-workspace.git /var/mypa/pa-workspace
cd /var/mypa/pa-workspace
npm ci
npx tsc

# Create .env
cat > .env <<EOF
PORT=3003
NODE_ENV=production
DATABASE_URL=file:/var/mypa/data/pa-workspace.db
JWT_SECRET=<same-as-mypa-backend>

# Google Workspace (to be configured)
GOOGLE_ADMIN_EMAIL=admin@pa.mypa.chat
GOOGLE_DOMAIN=pa.mypa.chat
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/var/mypa/pa-workspace/service-account.json

# Email transport
TEZ_API_URL=https://api.mypa.chat/api
EOF

# Start with PM2
pm2 start ecosystem.config.cjs --env production
pm2 save
```

### 2. Add Google Workspace Setup Guide

Need comprehensive guide for:
1. Purchasing Google Workspace Business Starter
2. Creating Google Cloud project
3. Enabling Admin SDK, Gmail API, Calendar API, Voice API
4. Creating service account with domain-wide delegation
5. Downloading service account JSON key
6. Provisioning PA accounts via Admin SDK

**Time estimate:** 2-4 hours (first time)

### 3. Add Cost Monitoring

Add scripts to track actual usage:

```bash
# Track Claude API usage (via OpenClaw logs)
# Track OpenAI API usage (via API dashboard)
# Track DB growth
# Alert when costs exceed thresholds
```

### 4. Update Cost Documentation

Replace this line in `deploy/README.md`:

```markdown
## Cost

- **DigitalOcean 4GB Droplet**: $24/mo
- **OpenAI API** (usage-based): ~$20-50/mo
- **Total**: ~$44-74/mo
```

With:

```markdown
## Cost (20 Users)

- **DigitalOcean 4GB Droplet**: $24/mo
- **Claude API** (via OpenClaw): ~$729/mo (moderate usage)
- **OpenAI API** (Whisper + TIP): ~$141/mo
- **Google Workspace** (optional, 20 PA accounts): ~$140/mo
- **Total WITHOUT PA Workspace**: ~$900/mo ($45/user)
- **Total WITH PA Workspace**: ~$1,040/mo ($52/user)

**Heavy usage (10+ sessions/day):** $2,500-3,700/mo
```

---

## 🚀 Updated Deployment Decision

**Before I proceed with deployment, you need to decide:**

### Question 1: PA Workspace (Google Workspace Integration)

**Deploy PA Workspace now?**

- ✅ **Yes** → Need to purchase Google Workspace, set up Admin SDK, provision 20 PA accounts
  - **Cost:** +$140/month (Google Workspace)
  - **Setup time:** +2-4 hours (manual Google setup)

- ❌ **No** → Deploy MVP without email/calendar/voice features
  - **Cost saved:** -$140/month
  - **Can add later:** Yes (no migration needed)

### Question 2: User Count for Initial Deployment

**How many users to provision initially?**

- **5 users (pilot):** ~$225/month (Claude + OpenAI)
- **20 users (full team):** ~$900/month (Claude + OpenAI)

### Question 3: Claude API Access

**Do you have Claude API credentials?**

- Need: Anthropic API key for OpenClaw
- Cost: ~$36.45/user/month (moderate usage)

---

## 📝 Action Items Before Deployment

1. **Confirm user count** (5 pilot or 20 full?)
2. **Decide on PA Workspace** (yes/no)
3. **Get Claude API key** (from Anthropic Console)
4. **Get OpenAI API key** (from OpenAI Platform)
5. **If PA Workspace YES:** Purchase Google Workspace domain

**Once decided, I can deploy with correct configuration and accurate cost expectations.**

---

## Summary

**Original estimate:** $44-74/month ❌ **WRONG**

**Actual cost (20 users, moderate usage):**
- **WITHOUT PA Workspace:** ~$900/month
- **WITH PA Workspace:** ~$1,040/month

**The BIG costs are:**
1. Claude API: ~$729/month (75% of total!)
2. OpenAI API: ~$141/month (15% of total)
3. Google Workspace: ~$140/month (optional)
4. Infrastructure: ~$30/month (3% of total)

**Cost per user:** $45-52/user/month (comparable to enterprise ChatGPT Plus + Google Workspace)
