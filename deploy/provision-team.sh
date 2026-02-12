#!/usr/bin/env bash
set -euo pipefail

# Master orchestration script for provisioning a new team droplet.
# Runs on the main droplet (164.90.135.75). Coordinates all steps:
#   doctl droplet create → fresh-server-setup → twenty CRM → openclaw →
#   secrets + .env → deploy artifacts → init DB + admin → DNS + SSL → PM2 start
#
# Required env vars:
#   TEAM_NAME, SUBDOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD
#   JOB_ID, DO_API_TOKEN, SSH_KEY_FINGERPRINT, VPC_UUID
#
# Optional env vars:
#   DROPLET_SIZE  (default: s-2vcpu-4gb)
#   REGION        (default: nyc3)
#   BASE_DOMAIN   (default: mypa.chat)
#   APP_NAME      (default: MyPA)
#   APP_SLUG      (default: mypa)
#   CALLBACK_URL  (default: http://127.0.0.1:3001/api/admin/provision-jobs/$JOB_ID/update)
#   RETRY         (default: false)
#   EXISTING_DROPLET_ID, EXISTING_DROPLET_IP  (for retry)

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
# Configuration
# ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${TEAM_NAME:?TEAM_NAME is required}"
: "${SUBDOMAIN:?SUBDOMAIN is required}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL is required}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
: "${JOB_ID:?JOB_ID is required}"
: "${DO_API_TOKEN:?DO_API_TOKEN is required}"
: "${SSH_KEY_FINGERPRINT:?SSH_KEY_FINGERPRINT is required}"
: "${VPC_UUID:?VPC_UUID is required}"

DROPLET_SIZE="${DROPLET_SIZE:-s-2vcpu-4gb}"
REGION="${REGION:-nyc3}"
BASE_DOMAIN="${BASE_DOMAIN:-mypa.chat}"
APP_NAME="${APP_NAME:-MyPA}"
APP_SLUG="${APP_SLUG:-mypa}"
CALLBACK_URL="${CALLBACK_URL:-http://127.0.0.1:3001/api/admin/provision-jobs/${JOB_ID}/update}"
RETRY="${RETRY:-false}"
EXISTING_DROPLET_ID="${EXISTING_DROPLET_ID:-}"
EXISTING_DROPLET_IP="${EXISTING_DROPLET_IP:-}"

TEAM_DOMAIN="${SUBDOMAIN}.${BASE_DOMAIN}"
DEPLOY_ARTIFACTS="/var/mypa/deploy-artifacts"

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -i /root/.ssh/deploy_key"
DROPLET_ID=""
DROPLET_IP=""

# ─────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────
update_status() {
    local status="$1"
    local step_name="$2"
    local progress="$3"
    shift 3
    local extra_json="$*"

    local payload
    payload=$(cat <<EOJSON
{
  "status": "${status}",
  "step": "${step_name}",
  "progress": ${progress}${extra_json:+, ${extra_json}}
}
EOJSON
)

    curl -sf -X POST "${CALLBACK_URL}" \
        -H "Content-Type: application/json" \
        -d "${payload}" >/dev/null 2>&1 || true
}

append_log() {
    local message="$1"
    curl -sf -X POST "${CALLBACK_URL}" \
        -H "Content-Type: application/json" \
        -d "{\"log\": \"${message}\"}" >/dev/null 2>&1 || true
}

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

fail_job() {
    local message="${1:-Provisioning failed}"
    log_error "${message}"
    update_status "failed" "error" 0 "\"error\": \"${message}\""
    exit 1
}

remote_exec() {
    ssh ${SSH_OPTS} "root@${DROPLET_IP}" "$@"
}

remote_scp() {
    scp ${SSH_OPTS} "$@"
}

# ─────────────────────────────────────────────────────────────────────
# Trap errors → mark job failed
# ─────────────────────────────────────────────────────────────────────
trap 'fail_job "Unexpected error on line ${LINENO}: ${BASH_COMMAND}"' ERR

# ─────────────────────────────────────────────────────────────────────
log_header "Provisioning Team: ${TEAM_NAME}"
log_info "Subdomain: ${TEAM_DOMAIN}"
log_info "Droplet size: ${DROPLET_SIZE}, Region: ${REGION}"
log_info "Job ID: ${JOB_ID}"
log_info "Retry: ${RETRY}"

# ═════════════════════════════════════════════════════════════════════
# Step 1: Create Droplet (0-10%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 1/9: Creating droplet..."
update_status "provisioning" "creating_droplet" 0

if [[ "${RETRY}" == "true" && -n "${EXISTING_DROPLET_IP}" ]]; then
    log_info "Retry mode — reusing existing droplet"
    DROPLET_ID="${EXISTING_DROPLET_ID}"
    DROPLET_IP="${EXISTING_DROPLET_IP}"
    append_log "Retry: reusing droplet ${DROPLET_ID} at ${DROPLET_IP}"
else
    DROPLET_NAME="${SUBDOMAIN}-${APP_SLUG}"
    log_info "Creating droplet: ${DROPLET_NAME}"

    DOCTL_OUTPUT=$(doctl compute droplet create "${DROPLET_NAME}" \
        --size "${DROPLET_SIZE}" \
        --region "${REGION}" \
        --image ubuntu-24-04-x64 \
        --ssh-keys "${SSH_KEY_FINGERPRINT}" \
        --vpc-uuid "${VPC_UUID}" \
        --tag-name "${APP_SLUG}-team" \
        --wait \
        --format ID,PublicIPv4 \
        --no-header 2>&1) || fail_job "doctl droplet create failed: ${DOCTL_OUTPUT}"

    DROPLET_ID=$(echo "${DOCTL_OUTPUT}" | awk '{print $1}')
    DROPLET_IP=$(echo "${DOCTL_OUTPUT}" | awk '{print $2}')

    if [[ -z "${DROPLET_ID}" || -z "${DROPLET_IP}" ]]; then
        fail_job "Failed to parse droplet ID/IP from doctl output: ${DOCTL_OUTPUT}"
    fi

    log_info "Droplet created: ID=${DROPLET_ID}, IP=${DROPLET_IP}"
    append_log "Droplet created: ${DROPLET_ID} at ${DROPLET_IP}"
fi

update_status "provisioning" "creating_droplet" 10 \
    "\"dropletId\": \"${DROPLET_ID}\", \"dropletIp\": \"${DROPLET_IP}\""

# ═════════════════════════════════════════════════════════════════════
# Step 2: Fresh Server Setup (10-25%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 2/9: Fresh server setup..."
update_status "provisioning" "server_setup" 10

wait_for_ssh "${DROPLET_IP}" || fail_job "Droplet never became reachable via SSH"

log_info "Running fresh-server-setup.sh on ${DROPLET_IP}..."
remote_scp "${SCRIPT_DIR}/fresh-server-setup.sh" "root@${DROPLET_IP}:/tmp/fresh-server-setup.sh"
remote_exec "chmod +x /tmp/fresh-server-setup.sh && bash /tmp/fresh-server-setup.sh" \
    || fail_job "fresh-server-setup.sh failed"

append_log "Base server setup complete"
update_status "provisioning" "server_setup" 25

# ═════════════════════════════════════════════════════════════════════
# Step 3: Install Twenty CRM (25-40%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 3/9: Installing Twenty CRM..."
update_status "provisioning" "installing_crm" 25

remote_scp "${SCRIPT_DIR}/install-twenty-crm.sh" "root@${DROPLET_IP}:/tmp/install-twenty-crm.sh"
TWENTY_OUTPUT=$(remote_exec "chmod +x /tmp/install-twenty-crm.sh && bash /tmp/install-twenty-crm.sh" 2>&1) \
    || fail_job "install-twenty-crm.sh failed"

# Capture the APP_SECRET output (last line)
TWENTY_APP_SECRET=$(echo "${TWENTY_OUTPUT}" | grep "^TWENTY_APP_SECRET=" | tail -1 | cut -d= -f2-)
if [[ -z "${TWENTY_APP_SECRET}" ]]; then
    log_warn "Could not capture Twenty APP_SECRET from output"
    TWENTY_APP_SECRET="$(openssl rand -hex 32)"
fi

append_log "Twenty CRM installed"
update_status "provisioning" "installing_crm" 40

# ═════════════════════════════════════════════════════════════════════
# Step 4: Install OpenClaw (40-50%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 4/9: Setting up OpenClaw Gateway..."
update_status "provisioning" "installing_openclaw" 40

remote_scp "${SCRIPT_DIR}/install-openclaw.sh" "root@${DROPLET_IP}:/tmp/install-openclaw.sh"
OPENCLAW_OUTPUT=$(remote_exec "chmod +x /tmp/install-openclaw.sh && bash /tmp/install-openclaw.sh" 2>&1) \
    || fail_job "install-openclaw.sh failed"

# Capture the auth token (last line)
OPENCLAW_TOKEN=$(echo "${OPENCLAW_OUTPUT}" | grep "^OPENCLAW_TOKEN=" | tail -1 | cut -d= -f2-)
if [[ -z "${OPENCLAW_TOKEN}" ]]; then
    log_warn "Could not capture OpenClaw token from output"
    OPENCLAW_TOKEN=""
fi

append_log "OpenClaw Gateway installed"
update_status "provisioning" "installing_openclaw" 50

# ═════════════════════════════════════════════════════════════════════
# Step 5: Generate Secrets + .env Files (50-55%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 5/9: Generating secrets and .env files..."
update_status "provisioning" "generating_secrets" 50

JWT_SECRET=$(openssl rand -hex 32)
TWENTY_API_KEY=$(openssl rand -hex 24)

log_info "Creating .env files on droplet..."

# Backend .env
remote_exec bash -s <<ENVEOF
cat > /var/mypa/backend/.env <<'INNEREOF'
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Auth
JWT_SECRET=${JWT_SECRET}
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Database
DATABASE_PATH=/var/mypa/data/mypa/mypa.db

# App identity
APP_NAME=${APP_NAME}
APP_SLUG=${APP_SLUG}
TEAM_NAME=${TEAM_NAME}
TEAM_DOMAIN=${TEAM_DOMAIN}
BASE_DOMAIN=${BASE_DOMAIN}

# Relay (local — same droplet)
RELAY_ENABLED=true
RELAY_URL=http://127.0.0.1:3002

# Twenty CRM
TWENTY_API_URL=http://127.0.0.1:3004
TWENTY_API_KEY=${TWENTY_API_KEY}

# OpenClaw Gateway
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_TOKEN=${OPENCLAW_TOKEN}

# PA Workspace
PA_WORKSPACE_API_URL=http://127.0.0.1:3003
INNEREOF

chmod 640 /var/mypa/backend/.env
ENVEOF

# Relay .env
remote_exec bash -s <<ENVEOF
cat > /var/mypa/relay/.env <<'INNEREOF'
NODE_ENV=production
PORT=3002
HOST=0.0.0.0

JWT_SECRET=${JWT_SECRET}
DATABASE_PATH=/var/mypa/data/relay/tezit-relay.db
INNEREOF

chmod 640 /var/mypa/relay/.env
ENVEOF

# PA Workspace .env
remote_exec bash -s <<ENVEOF
cat > /var/mypa/pa-workspace/.env <<'INNEREOF'
NODE_ENV=production
PORT=3003
HOST=0.0.0.0

JWT_SECRET=${JWT_SECRET}
DATABASE_PATH=/var/mypa/data/pa-workspace/pa-workspace.db
INNEREOF

chmod 640 /var/mypa/pa-workspace/.env
ENVEOF

# OpenClaw .env files (agent credentials for mypa + crm skills)
# OpenClaw reads env vars from the ROOT .env, not the workspace .env.
# We write to both locations for compatibility.
log_info "Creating OpenClaw .env files..."
OPENCLAW_HOME="/home/openclaw/.openclaw"
remote_exec bash -s <<ENVEOF
mkdir -p ${OPENCLAW_HOME}/workspace

# Root-level .env (where OpenClaw actually reads env vars from)
cat > ${OPENCLAW_HOME}/.env <<INNEREOF
# OpenAI API key (set by install-openclaw.sh or manually)
# OPENAI_API_KEY=

# Backend API (used by mypa + crm skills)
MYPA_API_URL=http://127.0.0.1:3001

# Agent auth credentials (the agent logs in like any user)
MYPA_EMAIL=${ADMIN_EMAIL}
MYPA_PASSWORD=${ADMIN_PASSWORD}

# Relay API
RELAY_URL=http://127.0.0.1:3002

# PA Workspace
PA_WORKSPACE_API_URL=http://127.0.0.1:3003
INNEREOF

chmod 640 ${OPENCLAW_HOME}/.env

# Workspace .env (legacy/backup — some tools may read from here)
cp ${OPENCLAW_HOME}/.env ${OPENCLAW_HOME}/workspace/.env
chmod 640 ${OPENCLAW_HOME}/workspace/.env

chown -R openclaw:openclaw ${OPENCLAW_HOME}
ENVEOF

append_log "Secrets generated, .env files written"
update_status "provisioning" "generating_secrets" 55

# ═════════════════════════════════════════════════════════════════════
# Step 6: Deploy Application Artifacts (55-70%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 6/9: Deploying application artifacts..."
update_status "provisioning" "deploying_artifacts" 55

# Create target directories
remote_exec "mkdir -p /var/mypa/{backend,relay,pa-workspace,app-canvas,skills/mypa,data/{mypa,relay,pa-workspace}}"

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

# Rsync pa-workspace
log_info "Syncing pa-workspace..."
rsync -avz --delete -e "ssh ${SSH_OPTS}" \
    "${DEPLOY_ARTIFACTS}/pa-workspace/dist/" "root@${DROPLET_IP}:/var/mypa/pa-workspace/dist/"
scp ${SSH_OPTS} "${DEPLOY_ARTIFACTS}/pa-workspace/package.json" "root@${DROPLET_IP}:/var/mypa/pa-workspace/"
scp ${SSH_OPTS} "${DEPLOY_ARTIFACTS}/pa-workspace/package-lock.json" "root@${DROPLET_IP}:/var/mypa/pa-workspace/"
remote_exec "cd /var/mypa/pa-workspace && npm ci --omit=dev"

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

append_log "Application artifacts deployed"
update_status "provisioning" "deploying_artifacts" 70

# ═════════════════════════════════════════════════════════════════════
# Step 7: Initialize Databases + Create Admin (70-80%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 7/9: Initializing databases and creating admin user..."
update_status "provisioning" "initializing_db" 70

# Push database schemas via drizzle-kit
log_info "Running drizzle-kit push for backend..."
remote_exec "cd /var/mypa/backend && DATABASE_PATH=/var/mypa/data/mypa/mypa.db npx drizzle-kit push" \
    || fail_job "Backend drizzle-kit push failed"

log_info "Running drizzle-kit push for relay..."
remote_exec "cd /var/mypa/relay && DATABASE_PATH=/var/mypa/data/relay/tezit-relay.db npx drizzle-kit push" \
    || fail_job "Relay drizzle-kit push failed"

log_info "Running drizzle-kit push for pa-workspace..."
remote_exec "cd /var/mypa/pa-workspace && DATABASE_PATH=/var/mypa/data/pa-workspace/pa-workspace.db npx drizzle-kit push" \
    || fail_job "PA Workspace drizzle-kit push failed"

# Start backend temporarily for API calls
log_info "Starting backend temporarily for admin setup..."
remote_exec "cd /var/mypa/backend && node dist/index.js &" || true
sleep 5

# Register admin user
log_info "Creating admin user: ${ADMIN_EMAIL}"
REGISTER_RESPONSE=$(remote_exec "curl -sf -X POST http://127.0.0.1:3001/api/auth/register \
    -H 'Content-Type: application/json' \
    -d '{\"email\": \"${ADMIN_EMAIL}\", \"password\": \"${ADMIN_PASSWORD}\", \"name\": \"Admin\"}'" 2>&1) \
    || fail_job "Admin user registration failed: ${REGISTER_RESPONSE}"

# Extract access token from register response
ADMIN_TOKEN=$(echo "${REGISTER_RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || true)

# Create team via backend API
if [[ -n "${ADMIN_TOKEN}" ]]; then
    log_info "Creating team: ${TEAM_NAME}"
    remote_exec "curl -sf -X POST http://127.0.0.1:3001/api/onboarding/team \
        -H 'Content-Type: application/json' \
        -H 'Authorization: Bearer ${ADMIN_TOKEN}' \
        -d '{\"teamName\": \"${TEAM_NAME}\"}'" >/dev/null 2>&1 \
        || log_warn "Team creation returned non-zero (may already exist)"
fi

# Stop the temporary backend
remote_exec "pkill -f 'node dist/index.js' || true"
sleep 2

append_log "Databases initialized, admin user created"
update_status "provisioning" "initializing_db" 80

# ═════════════════════════════════════════════════════════════════════
# Step 8: DNS + Nginx + SSL (80-95%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 8/9: Configuring DNS, Nginx, and SSL..."
update_status "provisioning" "configuring_dns_ssl" 80

# Create DNS A record
log_info "Creating DNS A record: ${TEAM_DOMAIN} -> ${DROPLET_IP}"
doctl compute domain records create "${BASE_DOMAIN}" \
    --record-type A \
    --record-name "${SUBDOMAIN}" \
    --record-data "${DROPLET_IP}" \
    --record-ttl 300 \
    || log_warn "DNS record creation failed (may already exist)"

append_log "DNS record created"
update_status "provisioning" "configuring_dns_ssl" 85

# Upload nginx config from template
log_info "Generating nginx config from template..."
export TEAM_DOMAIN
envsubst '${TEAM_DOMAIN}' < "${SCRIPT_DIR}/nginx-configs/nginx-team-template.conf" \
    | ssh ${SSH_OPTS} "root@${DROPLET_IP}" "cat > /etc/nginx/sites-available/${SUBDOMAIN}-${APP_SLUG}"

remote_exec "ln -sf /etc/nginx/sites-available/${SUBDOMAIN}-${APP_SLUG} /etc/nginx/sites-enabled/${SUBDOMAIN}-${APP_SLUG}"
remote_exec "rm -f /etc/nginx/sites-enabled/default"
remote_exec "nginx -t" || fail_job "Nginx config test failed"
remote_exec "systemctl reload nginx"

append_log "Nginx configured"
update_status "provisioning" "configuring_dns_ssl" 90

# Wait for DNS propagation (check a few times)
log_info "Waiting for DNS propagation..."
DNS_READY=false
for i in $(seq 1 12); do
    RESOLVED_IP=$(dig +short "${TEAM_DOMAIN}" @8.8.8.8 2>/dev/null || true)
    if [[ "${RESOLVED_IP}" == "${DROPLET_IP}" ]]; then
        DNS_READY=true
        break
    fi
    log_info "DNS not propagated yet (attempt ${i}/12), waiting 10s..."
    sleep 10
done

if [[ "${DNS_READY}" == "true" ]]; then
    log_info "DNS propagated. Running certbot..."
    remote_exec "certbot --nginx -d ${TEAM_DOMAIN} --non-interactive --agree-tos -m admin@${BASE_DOMAIN} --redirect" \
        || log_warn "Certbot failed — SSL will need manual setup"
    append_log "SSL certificate obtained"
else
    log_warn "DNS not propagated after 120s — skipping certbot, SSL needs manual setup"
    append_log "WARNING: DNS not propagated, SSL not configured"
fi

update_status "provisioning" "configuring_dns_ssl" 95

# ═════════════════════════════════════════════════════════════════════
# Step 9: Start Services + Health Check (95-100%)
# ═════════════════════════════════════════════════════════════════════
log_step "Step 9/9: Starting services and running health check..."
update_status "provisioning" "starting_services" 95

# Create PM2 ecosystem config
remote_exec bash -s <<'PM2EOF'
cat > /var/mypa/ecosystem.config.cjs <<'INNEREOF'
module.exports = {
  apps: [
    {
      name: "mypa-api",
      script: "/var/mypa/backend/dist/index.js",
      cwd: "/var/mypa/backend",
      env: { NODE_ENV: "production" },
      max_memory_restart: "512M",
      exec_mode: "fork"
    },
    {
      name: "tezit-relay",
      script: "/var/mypa/relay/dist/index.js",
      cwd: "/var/mypa/relay",
      env: { NODE_ENV: "production" },
      max_memory_restart: "256M",
      exec_mode: "fork"
    },
    {
      name: "pa-workspace",
      script: "/var/mypa/pa-workspace/dist/index.js",
      cwd: "/var/mypa/pa-workspace",
      env: { NODE_ENV: "production" },
      max_memory_restart: "256M",
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
    append_log "All services healthy"
else
    log_warn "Health check failed — services may still be starting"
    append_log "WARNING: Health check did not pass within 30s"
fi

update_status "ready" "complete" 100 \
    "\"dropletId\": \"${DROPLET_ID}\", \"dropletIp\": \"${DROPLET_IP}\", \"domain\": \"${TEAM_DOMAIN}\""

log_header "Provisioning Complete!"
log_info "Team: ${TEAM_NAME}"
log_info "Domain: https://${TEAM_DOMAIN}"
log_info "Droplet: ${DROPLET_ID} (${DROPLET_IP})"
log_info "Admin: ${ADMIN_EMAIL}"
