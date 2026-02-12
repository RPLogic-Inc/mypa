#!/usr/bin/env bash
set -euo pipefail

# Set up OpenClaw Gateway on a fresh Ubuntu 24.04 droplet.
# Runs ON the new droplet (SCP'd and executed by provision-team.sh).
#
# NOTE: The OpenClaw binary must already be installed at /opt/openclaw/ (READ-ONLY).
#       This script creates the user, workspace, and systemd service only.
#
# Gateway runs on port 18789 (localhost only, proxied via nginx).
# Outputs OPENCLAW_TOKEN=<value> on success for the parent script to capture.

# ─────────────────────────────────────────────────────────────────────
# Colors
# ─────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OPENCLAW]${NC} $*"; }
step() { echo -e "${BLUE}==>${NC} $*"; }
err()  { echo -e "${RED}[OPENCLAW]${NC} $*" >&2; }

# ─────────────────────────────────────────────────────────────────────
# Verify binary exists
# ─────────────────────────────────────────────────────────────────────
if [[ ! -x /opt/openclaw/openclaw ]]; then
    err "OpenClaw binary not found at /opt/openclaw/openclaw"
    err "The binary must be manually pre-installed before running this script."
    exit 1
fi

log "OpenClaw binary found at /opt/openclaw/openclaw"

# ─────────────────────────────────────────────────────────────────────
# Step 1: Create openclaw system user
# ─────────────────────────────────────────────────────────────────────
step "Creating openclaw user..."

if id openclaw &>/dev/null; then
    log "User 'openclaw' already exists"
else
    useradd -r -s /bin/bash -d /home/openclaw -m openclaw
    log "User 'openclaw' created"
fi

# ─────────────────────────────────────────────────────────────────────
# Step 2: Initialize OpenClaw workspace
# ─────────────────────────────────────────────────────────────────────
step "Initializing OpenClaw workspace..."

if [[ -f /home/openclaw/.openclaw/openclaw.json ]]; then
    log "Workspace already initialized"
else
    su - openclaw -c "/opt/openclaw/openclaw init"
    log "Workspace initialized"
fi

# Create workspace skills directory
mkdir -p /home/openclaw/.openclaw/workspace/skills

# Create placeholder root .env if it doesn't exist
# (provision-team.sh will overwrite with real credentials later)
if [[ ! -f /home/openclaw/.openclaw/.env ]]; then
    cat > /home/openclaw/.openclaw/.env <<'DOTENV'
# OpenClaw environment — populated by provision-team.sh
# OPENAI_API_KEY=
# MYPA_API_URL=http://127.0.0.1:3001
# MYPA_EMAIL=
# MYPA_PASSWORD=
DOTENV
    chmod 640 /home/openclaw/.openclaw/.env
    log "Placeholder .env created"
fi

# Ensure correct ownership
chown -R openclaw:openclaw /home/openclaw/.openclaw

# ─────────────────────────────────────────────────────────────────────
# Step 3: Create systemd service
# ─────────────────────────────────────────────────────────────────────
step "Creating systemd service..."

cat > /etc/systemd/system/openclaw-gateway.service <<'SERVICEEOF'
[Unit]
Description=OpenClaw Gateway
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=openclaw
Group=openclaw
WorkingDirectory=/home/openclaw
ExecStart=/opt/openclaw/openclaw serve
Restart=on-failure
RestartSec=10
Environment=PORT=18789

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/openclaw/.openclaw
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-gateway

[Install]
WantedBy=multi-user.target
SERVICEEOF

log "Systemd service created"

# ─────────────────────────────────────────────────────────────────────
# Step 4: Enable and start the service
# ─────────────────────────────────────────────────────────────────────
step "Enabling and starting OpenClaw Gateway..."

systemctl daemon-reload
systemctl enable openclaw-gateway
systemctl start openclaw-gateway

log "OpenClaw Gateway service started"

# ─────────────────────────────────────────────────────────────────────
# Step 5: Wait for Gateway to be healthy
# ─────────────────────────────────────────────────────────────────────
step "Waiting for Gateway to become healthy (up to 60s)..."

# Gateway needs ~15s to start
HEALTHY=false
for i in $(seq 1 12); do
    if curl -sf http://127.0.0.1:18789/health >/dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    echo "  Attempt ${i}/12 — not ready yet, waiting 5s..."
    sleep 5
done

if [[ "${HEALTHY}" == "true" ]]; then
    log "OpenClaw Gateway is healthy on port 18789"
else
    err "Gateway did not become healthy within 60s"
    journalctl -u openclaw-gateway --no-pager -n 30
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────
# Step 6: Extract and output auth token
# ─────────────────────────────────────────────────────────────────────
step "Extracting auth token..."

OPENCLAW_CONFIG="/home/openclaw/.openclaw/openclaw.json"

if [[ -f "${OPENCLAW_CONFIG}" ]]; then
    AUTH_TOKEN=$(python3 -c "
import json
with open('${OPENCLAW_CONFIG}') as f:
    config = json.load(f)
token = config.get('gateway', {}).get('auth', {}).get('token', '')
print(token)
" 2>/dev/null || true)

    if [[ -n "${AUTH_TOKEN}" ]]; then
        log "Auth token extracted successfully"
    else
        err "Could not extract auth token from openclaw.json"
        AUTH_TOKEN=""
    fi
else
    err "openclaw.json not found at ${OPENCLAW_CONFIG}"
    AUTH_TOKEN=""
fi

# ─────────────────────────────────────────────────────────────────────
# Output token for parent script
# ─────────────────────────────────────────────────────────────────────
log "OpenClaw Gateway installation complete"
echo "OPENCLAW_TOKEN=${AUTH_TOKEN}"
