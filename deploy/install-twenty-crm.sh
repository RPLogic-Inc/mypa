#!/usr/bin/env bash
set -euo pipefail

# Install Twenty CRM on a fresh Ubuntu 24.04 droplet.
# Runs ON the new droplet (SCP'd and executed by provision-team.sh).
#
# Sets up: Docker, Docker Compose, Postgres 16, Redis 7, Twenty CRM server + worker
# Twenty runs on port 3004 (localhost only).
#
# Outputs TWENTY_APP_SECRET=<value> on success for the parent script to capture.

# ─────────────────────────────────────────────────────────────────────
# Colors
# ─────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[TWENTY]${NC} $*"; }
step() { echo -e "${BLUE}==>${NC} $*"; }
err()  { echo -e "${RED}[TWENTY]${NC} $*" >&2; }

# ─────────────────────────────────────────────────────────────────────
# Step 1: Install Docker + Docker Compose plugin
# ─────────────────────────────────────────────────────────────────────
step "Installing Docker..."

if ! command -v docker &>/dev/null; then
    # Add Docker official GPG key and repository
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    log "Docker installed"
else
    log "Docker already installed"
fi

# Verify docker compose plugin
docker compose version || { err "Docker Compose plugin not available"; exit 1; }

# ─────────────────────────────────────────────────────────────────────
# Step 2: Create directory and generate secrets
# ─────────────────────────────────────────────────────────────────────
step "Setting up Twenty CRM directory..."

TWENTY_DIR="/var/mypa/twenty"
mkdir -p "${TWENTY_DIR}"

APP_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# ─────────────────────────────────────────────────────────────────────
# Step 3: Write docker-compose.yml
# ─────────────────────────────────────────────────────────────────────
step "Writing docker-compose.yml..."

cat > "${TWENTY_DIR}/docker-compose.yml" <<COMPOSEOF
version: "3.8"

services:
  postgres:
    image: postgres:16
    container_name: twenty-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: twenty
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: twenty
    volumes:
      - twenty_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U twenty"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - twenty-net

  redis:
    image: redis:7
    container_name: twenty-redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - twenty-net

  twenty-server:
    image: twentycrm/twenty:latest
    container_name: twenty-server
    restart: unless-stopped
    ports:
      - "127.0.0.1:3004:3000"
    environment:
      PORT: 3000
      PG_DATABASE_URL: postgres://twenty:${POSTGRES_PASSWORD}@postgres:5432/twenty
      REDIS_URL: redis://redis:6379
      APP_SECRET: ${APP_SECRET}
      SERVER_URL: http://localhost:3004
      FRONT_BASE_URL: http://localhost:3004
      IS_SIGN_UP_DISABLED: "false"
      STORAGE_TYPE: local
      STORAGE_LOCAL_PATH: /app/docker-data
    volumes:
      - twenty_data:/app/docker-data
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - twenty-net

  twenty-worker:
    image: twentycrm/twenty:latest
    container_name: twenty-worker
    restart: unless-stopped
    command: ["yarn", "worker:prod"]
    environment:
      PG_DATABASE_URL: postgres://twenty:${POSTGRES_PASSWORD}@postgres:5432/twenty
      REDIS_URL: redis://redis:6379
      APP_SECRET: ${APP_SECRET}
      STORAGE_TYPE: local
      STORAGE_LOCAL_PATH: /app/docker-data
    volumes:
      - twenty_data:/app/docker-data
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - twenty-net

volumes:
  twenty_pgdata:
  twenty_data:

networks:
  twenty-net:
    driver: bridge
COMPOSEOF

# ─────────────────────────────────────────────────────────────────────
# Step 4: Write .env file
# ─────────────────────────────────────────────────────────────────────
step "Writing .env file..."

cat > "${TWENTY_DIR}/.env" <<ENVEOF
APP_SECRET=${APP_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
ENVEOF

chmod 640 "${TWENTY_DIR}/.env"

# ─────────────────────────────────────────────────────────────────────
# Step 5: Start containers
# ─────────────────────────────────────────────────────────────────────
step "Starting Twenty CRM containers..."

cd "${TWENTY_DIR}"
docker compose up -d

# ─────────────────────────────────────────────────────────────────────
# Step 6: Wait for Twenty to be healthy
# ─────────────────────────────────────────────────────────────────────
step "Waiting for Twenty CRM to become healthy (up to 120s)..."

HEALTHY=false
for i in $(seq 1 24); do
    if curl -sf http://127.0.0.1:3004/healthz >/dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    echo "  Attempt ${i}/24 — not ready yet, waiting 5s..."
    sleep 5
done

if [[ "${HEALTHY}" == "true" ]]; then
    log "Twenty CRM is healthy and running on port 3004"
else
    err "Twenty CRM did not become healthy within 120s"
    docker compose logs --tail=50
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────
# Output secret for parent script
# ─────────────────────────────────────────────────────────────────────
log "Twenty CRM installation complete"
echo "TWENTY_APP_SECRET=${APP_SECRET}"
