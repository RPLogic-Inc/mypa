#!/usr/bin/env bash
set -euo pipefail

# Provisioning script for a personal MyPA instance on a small ($4-6/mo) droplet.
# Runs from the main droplet or a local machine with doctl + SSH access.
#
# Creates a lightweight, single-user MyPA instance with:
#   - Backend API (port 3001)
#   - Tezit Relay with federation (port 3002)
#   - OpenClaw Gateway (port 18789)
#   - Canvas SPA (nginx static)
#   - NO PA Workspace (saves memory)
#   - NO Twenty CRM Docker (saves memory)
#   - 256MB swap for small droplets
#
# Required env vars:
#   OWNER_EMAIL        — Owner's email
#   OWNER_PASSWORD     — Owner's password
#   SUBDOMAIN          — e.g., "rob" → rob.mypa.chat
#   DO_TOKEN           — DigitalOcean API token
#
# Optional env vars:
#   BASE_DOMAIN        (default: mypa.chat)
#   APP_NAME           (default: MyPA)
#   APP_SLUG           (default: mypa)
#   REGION             (default: nyc3)
#   DROPLET_SIZE       (default: s-1vcpu-512mb-10gb — $4/mo)
#   SSH_KEY_IDS        (default: "" — uses all account keys)
#   OPENAI_API_KEY     (default: "" — must be set later if not provided)

# ─────────────────────────────────────────────────────────────────────
# Colors
# ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()   { echo -e "${GREEN}[PROVISION]${NC} $*"; }
log_warn()   { echo -e "${YELLOW}[PROVISION]${NC} $*"; }
log_error()  { echo -e "${RED}[PROVISION]${NC} $*" >&2; }
log_step()   { echo -e "${BLUE}[STEP]${NC} $*"; }
log_header() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$*${NC}"
    echo -e "${CYAN}========================================${NC}"
}

# ─────────────────────────────────────────────────────────────────────
# Help message
# ─────────────────────────────────────────────────────────────────────
show_help() {
    cat <<'HELPEOF'
Usage: provision-personal.sh

Provisions a personal MyPA instance on a small DigitalOcean droplet ($4/mo).
Lightweight single-user setup: backend + relay + OpenClaw + Canvas.
No PA Workspace, no CRM — optimized for 512MB RAM.

Required environment variables:
  OWNER_EMAIL        Owner's email address (used for account + SSL cert)
  OWNER_PASSWORD     Owner's password
  SUBDOMAIN          Subdomain prefix (e.g., "rob" → rob.mypa.chat)
  DO_TOKEN           DigitalOcean API token

Optional environment variables:
  BASE_DOMAIN        Base domain (default: mypa.chat)
  APP_NAME           Application name (default: MyPA)
  APP_SLUG           Application slug (default: mypa)
  REGION             DigitalOcean region (default: nyc3)
  DROPLET_SIZE       Droplet size slug (default: s-1vcpu-512mb-10gb)
  SSH_KEY_IDS        Comma-separated SSH key IDs/fingerprints (default: all account keys)
  OPENAI_API_KEY     OpenAI API key for the agent (can be set later)

Example:
  OWNER_EMAIL="rob@example.com" \
  OWNER_PASSWORD="s3cure-pass!" \
  SUBDOMAIN="rob" \
  DO_TOKEN="dop_v1_abc123" \
  ./deploy/provision-personal.sh

The script will:
  1. Create a $4/mo droplet with 256MB swap
  2. Install system packages + Node.js + PM2 + nginx
  3. Install OpenClaw Gateway
  4. Generate secrets and .env files (INSTANCE_MODE=personal)
  5. Deploy backend, relay, canvas, and skills
  6. Initialize databases and push schemas
  7. Configure DNS, nginx, and SSL
  8. Start PM2 services (backend + relay only)
  9. Create owner account and disable public registration
HELPEOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

# ─────────────────────────────────────────────────────────────────────
# Validate required env vars
# ─────────────────────────────────────────────────────────────────────
MISSING_VARS=()

[[ -z "${OWNER_EMAIL:-}" ]]    && MISSING_VARS+=("OWNER_EMAIL")
[[ -z "${OWNER_PASSWORD:-}" ]] && MISSING_VARS+=("OWNER_PASSWORD")
[[ -z "${SUBDOMAIN:-}" ]]      && MISSING_VARS+=("SUBDOMAIN")
[[ -z "${DO_TOKEN:-}" ]]       && MISSING_VARS+=("DO_TOKEN")

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    log_error "Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        log_error "  - ${var}"
    done
    echo ""
    show_help
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_DOMAIN="${BASE_DOMAIN:-mypa.chat}"
APP_NAME="${APP_NAME:-MyPA}"
APP_SLUG="${APP_SLUG:-mypa}"
REGION="${REGION:-nyc3}"
DROPLET_SIZE="${DROPLET_SIZE:-s-1vcpu-512mb-10gb}"
SSH_KEY_IDS="${SSH_KEY_IDS:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"

PERSONAL_DOMAIN="${SUBDOMAIN}.${BASE_DOMAIN}"
DEPLOY_ARTIFACTS="/var/mypa/deploy-artifacts"

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
DROPLET_ID=""
DROPLET_IP=""

# ─────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────
wait_for_ssh() {
    local ip="$1"
    local max_attempts="${2:-60}"
    local attempt=0

    log_info "Waiting for SSH on ${ip}..."
    while [[ $attempt -lt $max_attempts ]]; do
        if ssh ${SSH_OPTS} "root@${ip}" "echo ready" >/dev/null 2>&1; then
            log_info "SSH is available on ${ip}"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 5
    done

    log_error "SSH not available after $((max_attempts * 5))s"
    return 1
}

fail() {
    local message="${1:-Provisioning failed}"
    log_error "${message}"
    exit 1
}

remote_exec() {
    ssh ${SSH_OPTS} "root@${DROPLET_IP}" "$@"
}

remote_scp() {
    scp ${SSH_OPTS} "$@"
}

check_prerequisite() {
    local cmd="$1"
    local name="${2:-$1}"
    if ! command -v "${cmd}" >/dev/null 2>&1; then
        fail "Required tool not found: ${name}. Please install it first."
    fi
}

# ─────────────────────────────────────────────────────────────────────
# Trap errors
# ─────────────────────────────────────────────────────────────────────
trap 'fail "Unexpected error on line ${LINENO}: ${BASH_COMMAND}"' ERR

# ─────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────────────────────────────
check_prerequisite "doctl" "doctl (DigitalOcean CLI)"
check_prerequisite "ssh" "ssh"
check_prerequisite "rsync" "rsync"
check_prerequisite "openssl" "openssl"
check_prerequisite "dig" "dig (dnsutils)"

# Verify doctl auth
log_info "Verifying DigitalOcean authentication..."
export DIGITALOCEAN_ACCESS_TOKEN="${DO_TOKEN}"
doctl account get >/dev/null 2>&1 || fail "doctl authentication failed. Check DO_TOKEN."

# Verify deploy artifacts exist
if [[ ! -d "${DEPLOY_ARTIFACTS}" ]]; then
    fail "Deploy artifacts not found at ${DEPLOY_ARTIFACTS}. Build and stage artifacts first."
fi

# ─────────────────────────────────────────────────────────────────────
log_header "Provisioning Personal Instance: ${SUBDOMAIN}"
log_info "Domain: ${PERSONAL_DOMAIN}"
log_info "Owner: ${OWNER_EMAIL}"
log_info "Droplet size: ${DROPLET_SIZE} (personal), Region: ${REGION}"

# ═════════════════════════════════════════════════════════════════════
# Step 1: Create Droplet (0-10%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 1/11: Creating droplet..."

DROPLET_NAME="${SUBDOMAIN}-${APP_SLUG}-personal"
log_info "Creating droplet: ${DROPLET_NAME}"

SSH_KEY_ARG=""
if [[ -n "${SSH_KEY_IDS}" ]]; then
    SSH_KEY_ARG="--ssh-keys ${SSH_KEY_IDS}"
else
    # Use all SSH keys on the account
    ALL_KEYS=$(doctl compute ssh-key list --format ID --no-header | tr '\n' ',' | sed 's/,$//')
    if [[ -n "${ALL_KEYS}" ]]; then
        SSH_KEY_ARG="--ssh-keys ${ALL_KEYS}"
    else
        fail "No SSH keys found on DigitalOcean account. Upload a key first."
    fi
fi

DOCTL_OUTPUT=$(doctl compute droplet create "${DROPLET_NAME}" \
    --size "${DROPLET_SIZE}" \
    --region "${REGION}" \
    --image ubuntu-24-04-x64 \
    ${SSH_KEY_ARG} \
    --tag-name "${APP_SLUG}-personal" \
    --wait \
    --format ID,PublicIPv4 \
    --no-header 2>&1) || fail "doctl droplet create failed: ${DOCTL_OUTPUT}"

DROPLET_ID=$(echo "${DOCTL_OUTPUT}" | awk '{print $1}')
DROPLET_IP=$(echo "${DOCTL_OUTPUT}" | awk '{print $2}')

if [[ -z "${DROPLET_ID}" || -z "${DROPLET_IP}" ]]; then
    fail "Failed to parse droplet ID/IP from doctl output: ${DOCTL_OUTPUT}"
fi

log_info "Droplet created: ID=${DROPLET_ID}, IP=${DROPLET_IP}"

# ═════════════════════════════════════════════════════════════════════
# Step 2: Wait for Droplet + SSH (10-15%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 2/11: Waiting for droplet to become reachable..."

wait_for_ssh "${DROPLET_IP}" || fail "Droplet never became reachable via SSH"

log_info "Droplet is reachable"

# ═════════════════════════════════════════════════════════════════════
# Step 3: System Setup + Swap (15-30%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 3/11: Fresh server setup + swap file..."

# Upload and run fresh-server-setup.sh
remote_scp "${SCRIPT_DIR}/fresh-server-setup.sh" "root@${DROPLET_IP}:/tmp/fresh-server-setup.sh"
remote_exec "chmod +x /tmp/fresh-server-setup.sh && bash /tmp/fresh-server-setup.sh" \
    || fail "fresh-server-setup.sh failed"

log_info "Base server setup complete"

# Create swap file (critical for 512MB droplets)
log_info "Creating 256MB swap file..."
remote_exec bash -s <<'SWAPEOF'
if [[ ! -f /swapfile ]]; then
    fallocate -l 256M /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Swap file created and enabled"
else
    echo "Swap file already exists"
fi
# Tune swappiness for low-memory server (prefer RAM, swap only when necessary)
sysctl vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf
SWAPEOF

log_info "Swap file configured"

# ═════════════════════════════════════════════════════════════════════
# Step 4: Install OpenClaw (30-40%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 4/11: Setting up OpenClaw Gateway..."

remote_scp "${SCRIPT_DIR}/install-openclaw.sh" "root@${DROPLET_IP}:/tmp/install-openclaw.sh"
OPENCLAW_OUTPUT=$(remote_exec "chmod +x /tmp/install-openclaw.sh && bash /tmp/install-openclaw.sh" 2>&1) \
    || fail "install-openclaw.sh failed"

# Capture the auth token (last line)
OPENCLAW_TOKEN=$(echo "${OPENCLAW_OUTPUT}" | grep "^OPENCLAW_TOKEN=" | tail -1 | cut -d= -f2-)
if [[ -z "${OPENCLAW_TOKEN}" ]]; then
    log_warn "Could not capture OpenClaw token from output"
    OPENCLAW_TOKEN=""
fi

log_info "OpenClaw Gateway installed"

# ═════════════════════════════════════════════════════════════════════
# Step 5: Generate Secrets + .env Files (40-50%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 5/11: Generating secrets and .env files..."

JWT_SECRET=$(openssl rand -hex 32)

log_info "Creating .env files on droplet..."

# Backend .env — INSTANCE_MODE=personal, no CRM, no PA Workspace
remote_exec bash -s <<ENVEOF
cat > /var/mypa/backend/.env <<'INNEREOF'
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Instance mode
INSTANCE_MODE=personal

# Auth
JWT_SECRET=${JWT_SECRET}
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Database
DATABASE_PATH=/var/mypa/data/mypa/mypa.db

# App identity
APP_NAME=${APP_NAME}
APP_SLUG=${APP_SLUG}
PERSONAL_DOMAIN=${PERSONAL_DOMAIN}
BASE_DOMAIN=${BASE_DOMAIN}

# Relay (local — same droplet)
RELAY_ENABLED=true
RELAY_URL=http://127.0.0.1:3002

# OpenClaw Gateway
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_TOKEN=${OPENCLAW_TOKEN}

# No CRM on personal instances (saves memory)
# TWENTY_API_URL=
# TWENTY_API_KEY=

# No PA Workspace on personal instances
# PA_WORKSPACE_API_URL=
INNEREOF

chmod 640 /var/mypa/backend/.env
ENVEOF

# Relay .env — INSTANCE_MODE=personal, federation enabled
remote_exec bash -s <<ENVEOF
cat > /var/mypa/relay/.env <<'INNEREOF'
NODE_ENV=production
PORT=3002
HOST=0.0.0.0

# Instance mode
INSTANCE_MODE=personal

JWT_SECRET=${JWT_SECRET}
DATABASE_PATH=/var/mypa/data/relay/tezit-relay.db

# Federation enabled for personal instances (connect to team hubs)
FEDERATION_ENABLED=true
INNEREOF

chmod 640 /var/mypa/relay/.env
ENVEOF

# OpenClaw .env files (agent credentials)
log_info "Creating OpenClaw .env files..."
OPENCLAW_HOME="/home/openclaw/.openclaw"
remote_exec bash -s <<ENVEOF
mkdir -p ${OPENCLAW_HOME}/workspace

# Root-level .env (where OpenClaw actually reads env vars from)
cat > ${OPENCLAW_HOME}/.env <<INNEREOF
# Instance mode
INSTANCE_MODE=personal

# OpenAI API key
OPENAI_API_KEY=${OPENAI_API_KEY}

# Backend API (used by mypa skill)
MYPA_API_URL=http://127.0.0.1:3001

# Agent auth credentials (the agent logs in like any user)
MYPA_EMAIL=${OWNER_EMAIL}
MYPA_PASSWORD=${OWNER_PASSWORD}

# Relay API
RELAY_URL=http://127.0.0.1:3002
INNEREOF

chmod 640 ${OPENCLAW_HOME}/.env

# Workspace .env (legacy/backup — some tools may read from here)
cp ${OPENCLAW_HOME}/.env ${OPENCLAW_HOME}/workspace/.env
chmod 640 ${OPENCLAW_HOME}/workspace/.env

chown -R openclaw:openclaw ${OPENCLAW_HOME}
ENVEOF

log_info "Secrets generated, .env files written"

# ═════════════════════════════════════════════════════════════════════
# Step 6: Deploy Application Artifacts (50-65%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 6/11: Deploying application artifacts..."

# Create target directories (no pa-workspace for personal)
remote_exec "mkdir -p /var/mypa/{backend,relay,app-canvas,skills/mypa,data/{mypa,relay}}"

# Rsync backend
log_info "Syncing backend..."
rsync -avz --delete -e "ssh ${SSH_OPTS}" \
    "${DEPLOY_ARTIFACTS}/backend/dist/" "root@${DROPLET_IP}:/var/mypa/backend/dist/"
scp ${SSH_OPTS} "${DEPLOY_ARTIFACTS}/backend/package.json" "root@${DROPLET_IP}:/var/mypa/backend/"
scp ${SSH_OPTS} "${DEPLOY_ARTIFACTS}/backend/package-lock.json" "root@${DROPLET_IP}:/var/mypa/backend/"
remote_exec "cd /var/mypa/backend && npm ci --omit=dev"

# Rsync relay
log_info "Syncing relay..."
rsync -avz --delete -e "ssh ${SSH_OPTS}" \
    "${DEPLOY_ARTIFACTS}/relay/dist/" "root@${DROPLET_IP}:/var/mypa/relay/dist/"
scp ${SSH_OPTS} "${DEPLOY_ARTIFACTS}/relay/package.json" "root@${DROPLET_IP}:/var/mypa/relay/"
scp ${SSH_OPTS} "${DEPLOY_ARTIFACTS}/relay/package-lock.json" "root@${DROPLET_IP}:/var/mypa/relay/"
# Also send schema source for drizzle-kit
remote_exec "mkdir -p /var/mypa/relay/src/db"
scp ${SSH_OPTS} "${DEPLOY_ARTIFACTS}/relay/src/db/schema.ts" "root@${DROPLET_IP}:/var/mypa/relay/src/db/"
remote_exec "cd /var/mypa/relay && npm ci --omit=dev"

# No pa-workspace for personal instances

# Rsync canvas
log_info "Syncing canvas..."
rsync -avz --delete -e "ssh ${SSH_OPTS}" \
    "${DEPLOY_ARTIFACTS}/canvas/" "root@${DROPLET_IP}:/var/mypa/app-canvas/"

# Rsync skills
log_info "Syncing skills..."
rsync -avz --delete -e "ssh ${SSH_OPTS}" \
    "${DEPLOY_ARTIFACTS}/skills/" "root@${DROPLET_IP}:/var/mypa/skills/"

# Deploy skills to OpenClaw workspace (so the agent can use them)
log_info "Deploying skills to OpenClaw workspace..."
remote_exec "mkdir -p /home/openclaw/.openclaw/workspace/skills"
remote_exec "cp -r /var/mypa/skills/* /home/openclaw/.openclaw/workspace/skills/"
remote_exec "chown -R openclaw:openclaw /home/openclaw/.openclaw/workspace/skills"

log_info "Application artifacts deployed"

# ═════════════════════════════════════════════════════════════════════
# Step 7: Initialize Databases (65-75%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 7/11: Initializing databases..."

# Push database schemas via drizzle-kit
log_info "Running drizzle-kit push for backend..."
remote_exec "cd /var/mypa/backend && DATABASE_PATH=/var/mypa/data/mypa/mypa.db npx drizzle-kit push" \
    || fail "Backend drizzle-kit push failed"

log_info "Running drizzle-kit push for relay..."
remote_exec "cd /var/mypa/relay && DATABASE_PATH=/var/mypa/data/relay/tezit-relay.db npx drizzle-kit push" \
    || fail "Relay drizzle-kit push failed"

# No pa-workspace drizzle-kit push for personal instances

log_info "Databases initialized"

# ═════════════════════════════════════════════════════════════════════
# Step 8: Configure Nginx (75-82%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 8/11: Configuring nginx..."

# Upload security headers snippet
remote_scp "${SCRIPT_DIR}/nginx-configs/security-headers.conf" \
    "root@${DROPLET_IP}:/etc/nginx/snippets/security-headers.conf"

# Generate nginx config — personal instances use a simpler template
# (no PA Workspace proxy, same backend+relay+canvas pattern)
log_info "Generating nginx config for ${PERSONAL_DOMAIN}..."

export TEAM_DOMAIN="${PERSONAL_DOMAIN}"
envsubst '${TEAM_DOMAIN}' < "${SCRIPT_DIR}/nginx-configs/nginx-team-template.conf" \
    | ssh ${SSH_OPTS} "root@${DROPLET_IP}" "cat > /etc/nginx/sites-available/${SUBDOMAIN}-${APP_SLUG}"

remote_exec "ln -sf /etc/nginx/sites-available/${SUBDOMAIN}-${APP_SLUG} /etc/nginx/sites-enabled/${SUBDOMAIN}-${APP_SLUG}"
remote_exec "rm -f /etc/nginx/sites-enabled/default"
remote_exec "nginx -t" || fail "Nginx config test failed"
remote_exec "systemctl reload nginx"

log_info "Nginx configured"

# ═════════════════════════════════════════════════════════════════════
# Step 9: DNS + SSL (82-92%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 9/11: Configuring DNS and SSL..."

# Create DNS A record
log_info "Creating DNS A record: ${PERSONAL_DOMAIN} -> ${DROPLET_IP}"
doctl compute domain records create "${BASE_DOMAIN}" \
    --record-type A \
    --record-name "${SUBDOMAIN}" \
    --record-data "${DROPLET_IP}" \
    --record-ttl 300 \
    || log_warn "DNS record creation failed (may already exist)"

# Wait for DNS propagation
log_info "Waiting for DNS propagation..."
DNS_READY=false
for i in $(seq 1 12); do
    RESOLVED_IP=$(dig +short "${PERSONAL_DOMAIN}" @8.8.8.8 2>/dev/null || true)
    if [[ "${RESOLVED_IP}" == "${DROPLET_IP}" ]]; then
        DNS_READY=true
        break
    fi
    log_info "DNS not propagated yet (attempt ${i}/12), waiting 10s..."
    sleep 10
done

if [[ "${DNS_READY}" == "true" ]]; then
    log_info "DNS propagated. Running certbot..."
    remote_exec "certbot --nginx -d ${PERSONAL_DOMAIN} --non-interactive --agree-tos -m ${OWNER_EMAIL} --redirect" \
        || log_warn "Certbot failed — SSL will need manual setup"
    log_info "SSL certificate obtained"
else
    log_warn "DNS not propagated after 120s — skipping certbot, SSL needs manual setup"
fi

# ═════════════════════════════════════════════════════════════════════
# Step 10: Start PM2 Services (92-97%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 10/11: Starting services..."

# Create PM2 ecosystem config — personal: backend + relay only (no pa-workspace)
remote_exec bash -s <<'PM2EOF'
cat > /var/mypa/ecosystem.config.cjs <<'INNEREOF'
module.exports = {
  apps: [
    {
      name: "mypa-api",
      script: "/var/mypa/backend/dist/index.js",
      cwd: "/var/mypa/backend",
      env: { NODE_ENV: "production" },
      max_memory_restart: "200M",
      exec_mode: "fork"
    },
    {
      name: "tezit-relay",
      script: "/var/mypa/relay/dist/index.js",
      cwd: "/var/mypa/relay",
      env: { NODE_ENV: "production" },
      max_memory_restart: "128M",
      exec_mode: "fork"
    }
  ]
};
INNEREOF
PM2EOF

# Start all PM2 processes
remote_exec "cd /var/mypa && pm2 delete all 2>/dev/null || true"
remote_exec "cd /var/mypa && pm2 start ecosystem.config.cjs"
remote_exec "pm2 save"
remote_exec "pm2 startup systemd -u root --hp /root 2>/dev/null || true"

# Wait for services to start
sleep 5

# Health check
log_info "Running health check..."
HEALTH_OK=false
for i in $(seq 1 6); do
    if remote_exec "curl -sf http://127.0.0.1:3001/health" >/dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    log_info "Health check attempt ${i}/6..."
    sleep 5
done

if [[ "${HEALTH_OK}" == "true" ]]; then
    log_info "Health check passed"
else
    log_warn "Health check failed — services may still be starting"
fi

# ═════════════════════════════════════════════════════════════════════
# Step 11: Create Owner Account + Disable Registration (97-100%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 11/11: Creating owner account and locking registration..."

# Register the owner user
log_info "Creating owner account: ${OWNER_EMAIL}"
REGISTER_RESPONSE=$(remote_exec "curl -sf -X POST http://127.0.0.1:3001/api/auth/register \
    -H 'Content-Type: application/json' \
    -d '{\"email\": \"${OWNER_EMAIL}\", \"password\": \"${OWNER_PASSWORD}\", \"name\": \"Owner\"}'" 2>&1) \
    || fail "Owner registration failed: ${REGISTER_RESPONSE}"

# Extract access token from register response
OWNER_TOKEN=$(echo "${REGISTER_RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || true)

if [[ -z "${OWNER_TOKEN}" ]]; then
    log_warn "Could not extract access token from registration response"
    log_warn "Owner account may not have been created — check manually"
fi

# Disable public registration (owner-only instance)
if [[ -n "${OWNER_TOKEN}" ]]; then
    log_info "Disabling public registration..."
    remote_exec "curl -sf -X PUT http://127.0.0.1:3001/api/settings/registration \
        -H 'Content-Type: application/json' \
        -H 'Authorization: Bearer ${OWNER_TOKEN}' \
        -d '{\"enabled\": false}'" >/dev/null 2>&1 \
        || log_warn "Failed to disable registration — do it manually via Settings"
    log_info "Public registration disabled"
else
    log_warn "Skipping registration disable — no auth token available"
fi

# ═════════════════════════════════════════════════════════════════════
# Done!
# ═════════════════════════════════════════════════════════════════════
log_header "Provisioning Complete!"
log_info "Instance: Personal"
log_info "Owner: ${OWNER_EMAIL}"
log_info "Domain: https://${PERSONAL_DOMAIN}"
log_info "Droplet: ${DROPLET_ID} (${DROPLET_IP})"
log_info "Services: mypa-api (3001), tezit-relay (3002), openclaw-gateway (18789)"
log_info ""
log_info "Memory-saving features:"
log_info "  - 256MB swap file active"
log_info "  - No PA Workspace (saves ~100MB)"
log_info "  - No Twenty CRM Docker (saves ~300MB)"
log_info "  - Lower PM2 memory limits (200MB backend, 128MB relay)"
log_info ""
if [[ -z "${OPENAI_API_KEY}" ]]; then
    log_warn "OPENAI_API_KEY was not provided — set it in ${OPENCLAW_HOME}/.env on the droplet"
fi
log_info "Federation is ENABLED — this instance can connect to team hubs"
