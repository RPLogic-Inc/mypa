# MyPA Deployment Scripts

This directory contains all scripts and configurations for deploying MyPA to production.

## Quick Start (Fresh Deployment)

**For a brand new DigitalOcean droplet:**

```bash
# 1. Install doctl and authenticate
brew install doctl
op read "op://Private/DigitalOcean/api_token" | doctl auth init --access-token -

# 2. Create droplet
doctl compute ssh-key import mypa-deploy-key --public-key-file ~/.ssh/id_ed25519.pub
SSH_KEY_FP=$(doctl compute ssh-key list --format FingerPrint --no-header)
doctl compute droplet create mypa-prod-01 \
  --region nyc3 --size s-2vcpu-4gb --image ubuntu-24-04-x64 \
  --ssh-keys $SSH_KEY_FP --tag-names mypa,production --wait

# 3. Get droplet IP and configure DNS
export DROPLET_IP=$(doctl compute droplet list mypa-prod-01 --format PublicIPv4 --no-header)
doctl compute domain records create mypa.chat --record-type A --record-name app --record-data $DROPLET_IP
doctl compute domain records create mypa.chat --record-type A --record-name api --record-data $DROPLET_IP
doctl compute domain records create mypa.chat --record-type A --record-name oc --record-data $DROPLET_IP

# 4. Get OpenAI API key
export OPENAI_API_KEY=$(op read "op://Private/OpenAI/api_key")  # Adjust path

# 5. Run quick deploy
./quick-deploy.sh

# 6. Manually install OpenClaw (follow prompts in quick-deploy.sh)

# 7. Push to GitHub to trigger full deployment
git add . && git commit -m "Initial deployment config" && git push origin main
gh run watch
```

## Files Overview

### Setup Scripts

| File | Purpose | When to Run |
|------|---------|-------------|
| **quick-deploy.sh** | Automated deployment (server setup + nginx + GitHub secrets) | Once, after creating droplet |
| **fresh-server-setup.sh** | Install base software (Node, nginx, PM2, etc.) | Runs automatically from quick-deploy.sh |
| **run-migrations.sh** | Apply database migrations with tracking | Runs automatically on deploy |
| **server-deploy.sh** | Server-side deploy (migrations + PM2 restart) | Runs automatically via GitHub Actions |

### Nginx Configs

| File | Purpose | Destination |
|------|---------|-------------|
| **nginx-configs/mypa-app.conf** | App + API routing for app.mypa.chat | /etc/nginx/sites-available/mypa-app |
| **nginx-configs/openclaw-gateway.conf** | Gateway routing for oc.mypa.chat | /etc/nginx/sites-available/openclaw-gateway |
| **nginx-configs/openclaw-auth.conf.template** | OpenClaw auth token injection | /etc/nginx/snippets/openclaw-auth.conf |

### Documentation

| File | Purpose |
|------|---------|
| **DEPLOYMENT_GUIDE.md** | Complete step-by-step deployment guide |
| **README.md** | This file - quick reference |

## GitHub Actions CI/CD

GitHub Actions automatically deploys on push to `main`:

### Required Secrets

Configure these via `gh secret set`:

```bash
gh secret set DEPLOY_HOST --body "$DROPLET_IP"
gh secret set DEPLOY_USER --body "root"
gh secret set DEPLOY_PORT --body "22"
gh secret set DEPLOY_PATH --body "/var/mypa"
gh secret set DEPLOY_SSH_KEY < ~/.ssh/id_ed25519
```

### Workflow

1. **Push to main** → Triggers GitHub Actions
2. **CI Jobs**: typecheck, lint, test-backend
3. **Build**: Compile frontend & backend
4. **Detect Changes**: Check what needs deployment
5. **Deploy**: Backend, Frontend, and/or Skills
6. **Health Check**: Verify deployment success

Watch deployment: `gh run watch`

## Manual Deployment (Without GitHub Actions)

If you need to deploy manually:

```bash
# Build locally
cd backend && npx tsc && cd ..
cd frontend && VITE_APP_NAME=MyPA VITE_APP_SLUG=mypa npm run build && cd ..

# Deploy
./deploy.sh

# Or use rsync directly:
rsync -avz --delete backend/dist/ root@$DROPLET_IP:/var/mypa/backend/dist/
rsync -avz --delete frontend/dist/ root@$DROPLET_IP:/var/mypa/frontend/dist/
ssh root@$DROPLET_IP "cd /var/mypa/backend && npm ci --omit=dev && pm2 restart mypa-api"
```

## Troubleshooting

### Assistant says "I can't find CRM files/folders"

That means the runtime assistant is not using MyPA's CRM API workflow (or is on a stale skill/session).

Run this remediation on the droplet:

```bash
export TWENTY_API_URL="http://127.0.0.1:3004"   # your Twenty endpoint
export TWENTY_API_KEY="<real_twenty_api_key>"
bash /var/mypa/deploy/fix-crm-agent-on-droplet.sh
```

What it does:
- sets `TWENTY_API_URL` + `TWENTY_API_KEY` in `/var/mypa/backend/.env`
- syncs latest `skills/mypa/SKILL.md` into OpenClaw workspaces
- restarts `mypa-api` (and `openclaw-gateway` if present)
- runs CRM connectivity check when available

After running, start a **new** assistant chat session and retry.

### Deployment fails

```bash
# Check GitHub Actions logs
gh run view --log-failed

# SSH to server and check PM2
ssh root@$DROPLET_IP
pm2 list
pm2 logs mypa-api --lines 50
```

### Backend won't start

```bash
# Check .env file
ssh root@$DROPLET_IP cat /var/mypa/backend/.env

# Check database
ssh root@$DROPLET_IP sqlite3 /var/mypa/data/mypa.db ".tables"

# Check migrations
ssh root@$DROPLET_IP sqlite3 /var/mypa/data/mypa.db "SELECT * FROM _migrations"
```

### Nginx 502 errors

```bash
# Check nginx error log
ssh root@$DROPLET_IP tail -f /var/log/nginx/error.log

# Restart services
ssh root@$DROPLET_IP "pm2 restart all && systemctl restart nginx"
```

### SSL certificate issues

```bash
# Check certificates
ssh root@$DROPLET_IP certbot certificates

# Renew manually
ssh root@$DROPLET_IP certbot renew --force-renewal
```

## Rollback

If deployment breaks production:

```bash
# Via GitHub Actions (revert commit)
git revert HEAD
git push origin main

# Or manual PM2 restart to previous version
ssh root@$DROPLET_IP pm2 restart mypa-api --update-env
```

## Architecture

```
                    DigitalOcean Droplet (4GB/2CPU)
                    ┌──────────────────────────────┐
                    │                              │
DNS (DO)            │  Nginx (Port 80/443)        │
  app.mypa.chat ────┼─> /               → Static  │
  api.mypa.chat ────┼─> /api/           → :3001   │
  oc.mypa.chat  ────┼─> /               → :18789  │
                    │                              │
                    │  PM2 Services:               │
                    │    - mypa-api (port 3001)    │
                    │    - openclaw-gateway (18789)│
                    │    - pa-workspace-api (3003) │
                    │                              │
                    │  SQLite:                     │
                    │    - /var/mypa/data/mypa.db  │
                    │                              │
                    └──────────────────────────────┘
                              │
                              v
                    GitHub Actions CI/CD
                    (auto-deploy on push)
```

## Cost

- **DigitalOcean 4GB Droplet**: $24/mo
- **OpenAI API**: ~$20-50/mo (usage-based)
- **Total**: ~$44-74/mo

## Next Steps After Deployment

1. **Create first user** via API
2. **Configure PA Workspace** (optional)
3. **Set up monitoring** (UptimeRobot, Sentry)
4. **Enable backups** (6-hourly cron)
5. **Invite team members**

---

**For detailed step-by-step instructions, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**
