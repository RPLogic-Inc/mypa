# MyPA Fresh Deployment Guide

Complete step-by-step guide to deploy MyPA on a fresh DigitalOcean droplet with GitHub Actions CI/CD.

---

## Prerequisites

- ✅ DigitalOcean account with API token in 1Password
- ✅ GitHub repos: `ragurob/team-sync` (or `ragurob/MyPA.chat`)
- ✅ Domain: `mypa.chat` (managed by DigitalOcean or registrar)
- ✅ OpenAI API key
- ✅ Local SSH key: `~/.ssh/id_ed25519`

---

## Phase 1: Create DigitalOcean Droplet

### 1.1 Install & Authenticate `doctl`

```bash
# Install DigitalOcean CLI
brew install doctl

# Authenticate (get token from 1Password)
op read "op://Private/DigitalOcean/api_token" | doctl auth init --access-token -

# Verify
doctl account get
```

### 1.2 Upload SSH Key

```bash
# View your public key
cat ~/.ssh/id_ed25519.pub

# Upload to DigitalOcean
doctl compute ssh-key import mypa-deploy-key \
  --public-key-file ~/.ssh/id_ed25519.pub

# Get fingerprint
doctl compute ssh-key list
# Note the fingerprint for next step
```

### 1.3 Create Droplet

```bash
# Create 4GB/2CPU droplet in NYC
# Replace <fingerprint> with your SSH key fingerprint from above
doctl compute droplet create mypa-prod-01 \
  --region nyc3 \
  --size s-2vcpu-4gb \
  --image ubuntu-24-04-x64 \
  --ssh-keys <fingerprint> \
  --tag-names mypa,production \
  --wait

# Get droplet IP
doctl compute droplet list mypa-prod-01 --format Name,PublicIPv4

# Note the IP address (we'll call it $DROPLET_IP)
# Export it for convenience:
export DROPLET_IP=<your-droplet-ip>
```

### 1.4 Configure DNS

Add A records for all three subdomains:

```bash
# Via doctl (if using DO DNS):
doctl compute domain records create mypa.chat \
  --record-type A --record-name app --record-data $DROPLET_IP --record-ttl 3600

doctl compute domain records create mypa.chat \
  --record-type A --record-name api --record-data $DROPLET_IP --record-ttl 3600

doctl compute domain records create mypa.chat \
  --record-type A --record-name oc --record-data $DROPLET_IP --record-ttl 3600

# Verify DNS propagation (may take a few minutes)
dig +short app.mypa.chat
```

---

## Phase 2: Server Setup

### 2.1 Initial Server Access

```bash
# SSH to droplet (first time)
ssh root@$DROPLET_IP

# Update hostname
hostnamectl set-hostname mypa-prod-01
exit
```

### 2.2 Upload & Run Setup Script

```bash
# Upload setup script
scp deploy/fresh-server-setup.sh root@$DROPLET_IP:/root/

# Run it
ssh root@$DROPLET_IP "bash /root/fresh-server-setup.sh"

# This will:
# - Update Ubuntu packages
# - Install Node.js 20, nginx, PM2, certbot, sqlite3
# - Configure UFW firewall
# - Create /var/mypa directory structure
# - Takes ~10 minutes
```

---

## Phase 3: Install OpenClaw Gateway

### 3.1 Download OpenClaw

```bash
ssh root@$DROPLET_IP

# Download OpenClaw binary (adjust URL to latest release)
cd /opt
wget https://github.com/anthropics/openclaw/releases/download/v1.x.x/openclaw-linux-x64.tar.gz
tar xzf openclaw-linux-x64.tar.gz
mv openclaw-linux-x64 openclaw
rm openclaw-linux-x64.tar.gz

# Make executable
chmod +x /opt/openclaw/openclaw

# Create openclaw user
useradd -r -s /bin/bash -d /home/openclaw -m openclaw
```

### 3.2 Initialize OpenClaw

```bash
# Switch to openclaw user
su - openclaw

# Initialize config (creates ~/.openclaw/openclaw.json)
/opt/openclaw/openclaw init

# Note the Gateway auth token from the config
cat ~/.openclaw/openclaw.json | grep '"token"'

# Save this token for nginx config
exit  # Back to root
```

### 3.3 Start OpenClaw Gateway

```bash
# Create PM2 config
cat > /home/openclaw/openclaw-pm2.config.cjs <<'EOF'
module.exports = {
  apps: [{
    name: 'openclaw-gateway',
    script: '/opt/openclaw/openclaw',
    args: 'gateway start',
    cwd: '/home/openclaw',
    user: 'openclaw',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    env: {
      NODE_ENV: 'production',
      OPENCLAW_PORT: 18789
    }
  }]
};
EOF

# Start Gateway as openclaw user
su - openclaw
pm2 start openclaw-pm2.config.cjs
pm2 save
pm2 startup  # Follow instructions to enable on boot
exit
```

---

## Phase 4: Configure Nginx & SSL

### 4.1 Upload Nginx Configs

```bash
# On local machine
scp deploy/nginx-configs/mypa-app.conf root@$DROPLET_IP:/etc/nginx/sites-available/
scp deploy/nginx-configs/openclaw-gateway.conf root@$DROPLET_IP:/etc/nginx/sites-available/
scp deploy/nginx-configs/openclaw-auth.conf.template root@$DROPLET_IP:/tmp/openclaw-auth.conf
```

### 4.2 Configure OpenClaw Auth Token

```bash
ssh root@$DROPLET_IP

# Get OpenClaw token
OPENCLAW_TOKEN=$(su - openclaw -c "cat ~/.openclaw/openclaw.json | grep -oP '(?<=\"token\": \")[^\"]*'")

# Create auth config with actual token
mkdir -p /etc/nginx/snippets
sed "s|YOUR_OPENCLAW_TOKEN_HERE|$OPENCLAW_TOKEN|" /tmp/openclaw-auth.conf > /etc/nginx/snippets/openclaw-auth.conf

# Verify
cat /etc/nginx/snippets/openclaw-auth.conf
```

### 4.3 Generate SSL Certificates

```bash
# Generate certs for all three domains
certbot --nginx -d app.mypa.chat -d api.mypa.chat
certbot --nginx -d oc.mypa.chat

# Enter your email when prompted
# Accept terms of service
# Certificates will auto-renew
```

### 4.4 Enable Sites

```bash
# Enable sites
ln -s /etc/nginx/sites-available/mypa-app /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/openclaw-gateway /etc/nginx/sites-enabled/

# Test config
nginx -t

# Restart
systemctl restart nginx

exit  # Back to local machine
```

---

## Phase 5: Configure GitHub Secrets

### 5.1 Set Deployment Secrets

```bash
# On local machine
cd /Volumes/5T\ Speedy/Coding\ Projects/team-sync

# Set all required secrets
gh secret set DEPLOY_HOST --body "$DROPLET_IP"
gh secret set DEPLOY_USER --body "root"
gh secret set DEPLOY_PORT --body "22"
gh secret set DEPLOY_PATH --body "/var/mypa"

# Upload SSH key (for GitHub Actions to deploy)
gh secret set DEPLOY_SSH_KEY < ~/.ssh/id_ed25519

# Verify secrets
gh secret list
```

---

## Phase 6: Initial Backend Deployment (Manual)

Before GitHub Actions can auto-deploy, we need to manually deploy once to set up the backend environment.

### 6.1 Create Backend .env File

```bash
ssh root@$DROPLET_IP

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# Create .env file
cat > /var/mypa/backend/.env <<EOF
# Server
PORT=3001
NODE_ENV=production
APP_URL=https://app.mypa.chat
APP_NAME=MyPA
APP_SLUG=mypa

# Database
DATABASE_URL=file:/var/mypa/data/mypa.db

# JWT
JWT_SECRET=$JWT_SECRET

# AI Services (you'll update this)
OPENAI_API_KEY=sk-YOUR_KEY_HERE
OPENCLAW_URL=http://127.0.0.1:18789
OPENCLAW_TOKEN=$(su - openclaw -c "cat ~/.openclaw/openclaw.json | grep -oP '(?<=\"token\": \")[^\"]*'")

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_CONSOLE=false
LOG_MAX_SIZE_MB=10
LOG_MAX_FILES=30
EOF

exit  # Back to local
```

### 6.2 Add OpenAI API Key

```bash
# Get your OpenAI API key and update on server
ssh root@$DROPLET_IP
nano /var/mypa/backend/.env
# Replace sk-YOUR_KEY_HERE with your actual key
# Save and exit (Ctrl+O, Enter, Ctrl+X)
exit
```

### 6.3 Deploy via GitHub Actions

```bash
# On local machine
cd /Volumes/5T\ Speedy/Coding\ Projects/team-sync

# Commit and push to trigger deployment
git add deploy/
git commit -m "Add deployment configs and nginx settings"
git push origin main

# Watch GitHub Actions
gh run watch

# This will:
# - Run tests
# - Build backend & frontend
# - Deploy to server
# - Run migrations
# - Restart PM2
# - Health check
```

---

## Phase 7: Verification

### 7.1 Check Services

```bash
ssh root@$DROPLET_IP

# Check PM2 processes
pm2 list
# Should show: mypa-api (online), openclaw-gateway (online)

# Check logs
pm2 logs --lines 20

# Check nginx
systemctl status nginx
```

### 7.2 Test APIs

```bash
# On local machine

# Backend health
curl https://app.mypa.chat/api/health
# Should return: {"status":"healthy",...}

# Frontend loads
curl -I https://app.mypa.chat
# Should return: HTTP/2 200
```

### 7.3 Create First User

```bash
# Via API
curl -X POST https://app.mypa.chat/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@mypa.chat",
    "password": "changeme123",
    "name": "Admin User",
    "teamName": "Core Team"
  }'

# Note the token returned
```

### 7.4 Test Frontend

- Open https://app.mypa.chat in browser
- Log in with admin@mypa.chat / changeme123
- Send a test Tez
- Verify Library tab shows content
- Test PA chat via OpenClaw Gateway

---

## Phase 8: Enable PM2 Startup

```bash
ssh root@$DROPLET_IP

# Run as root for main services
pm2 startup
pm2 save

# Run as openclaw user for Gateway
su - openclaw
pm2 startup
pm2 save
exit

exit  # Back to local
```

---

## Phase 9: Set Up Backups

```bash
ssh root@$DROPLET_IP

# Add cron job for 6-hourly backups
crontab -e

# Add this line:
0 */6 * * * tar czf /var/mypa/backups/mypa.db.backup-$(date +\%s).tar.gz /var/mypa/data/mypa.db && find /var/mypa/backups -name "*.tar.gz" -mtime +30 -delete

# Save and exit
exit
```

---

## Complete! 🎉

Your MyPA deployment is now live:

- **Frontend**: https://app.mypa.chat
- **API**: https://app.mypa.chat/api
- **Gateway**: https://oc.mypa.chat

**GitHub Actions will now automatically deploy on push to main.**

---

## Troubleshooting

### Backend won't start

```bash
ssh root@$DROPLET_IP
pm2 logs mypa-api --lines 50
# Check for errors

# Common issues:
# - Missing OPENAI_API_KEY in .env
# - Wrong OPENCLAW_TOKEN in .env
# - Database migration failed

# Fix and restart:
pm2 restart mypa-api
```

### Frontend shows 502 Bad Gateway

```bash
# Check if backend is running
ssh root@$DROPLET_IP
pm2 list
pm2 logs mypa-api

# Check nginx error log
tail -f /var/log/nginx/error.log
```

### SSL certificate issues

```bash
ssh root@$DROPLET_IP

# Check certificates
certbot certificates

# Renew if needed
certbot renew --dry-run
```

### OpenClaw Gateway not accessible

```bash
ssh root@$DROPLET_IP

# Check Gateway status
su - openclaw
pm2 logs openclaw-gateway

# Verify auth token in nginx
cat /etc/nginx/snippets/openclaw-auth.conf
```

---

## Next Steps

1. **Set up PA Workspace** (optional)
   - Clone `ragurob/pa-workspace` to `/var/mypa/pa-workspace`
   - Configure Google Admin SDK
   - Start PA Workspace service

2. **Invite Users**
   - Create team invites via API
   - Share with team members

3. **Configure Monitoring** (optional)
   - Set up UptimeRobot for uptime monitoring
   - Configure Sentry for error tracking
   - Add Papertrail for log aggregation

4. **Performance Tuning**
   - Monitor PM2: `pm2 monit`
   - Check disk usage: `df -h`
   - Review logs: `pm2 logs`

---

## Cost Estimate

- DigitalOcean 4GB Droplet: **$24/mo**
- Bandwidth (1TB included): **$0**
- OpenAI API (pay-as-you-go): **~$20-50/mo** (depends on usage)

**Total: ~$44-74/mo**

---

## Maintenance

### Weekly
- Check PM2 status: `pm2 list`
- Review error logs: `pm2 logs --err`

### Monthly
- Review backup retention: `ls -lh /var/mypa/backups/`
- Check SSL renewal: `certbot certificates`
- Update packages: `apt-get update && apt-get upgrade`

### Quarterly
- Review performance metrics
- Consider droplet size upgrade if needed
- Security audit

---

**Questions? Check the GitHub Actions logs or PM2 logs first.**

**Contact: Open an issue on GitHub**
