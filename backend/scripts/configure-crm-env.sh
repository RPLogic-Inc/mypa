#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# CRM Environment Configurator
#
# Detects running services (Twenty CRM, PA Workspace), writes or updates
# backend/.env with the correct connection vars, and verifies reachability.
#
# Usage:
#   npm run crm:configure                     # auto-detect and write .env
#   TWENTY_API_KEY=xxx npm run crm:configure   # supply key explicitly
#   npm run crm:configure -- --check-only     # verify without writing
#
# Exit codes:
#   0  All configured and reachable
#   1  Configuration written but some services unreachable
#   2  Fatal error
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${BACKEND_DIR}/.env"
ENV_EXAMPLE_FILE="${BACKEND_DIR}/.env.example"

DEFAULT_TWENTY_URL="http://127.0.0.1:3004"
DEFAULT_TWENTY_PORT=3004
DEFAULT_PA_URL="http://127.0.0.1:3003"
DEFAULT_PA_PORT=3003

CHECK_ONLY=false
EXIT_CODE=0

for arg in "$@"; do
  case "$arg" in
    --check-only) CHECK_ONLY=true ;;
  esac
done

# ─── Helpers ──────────────────────────────────────────────────────────────

G='\033[0;32m' Y='\033[0;33m' R='\033[0;31m' C='\033[0;36m' N='\033[0m'

ok()   { printf "${G}[OK]${N}    %s\n" "$1"; }
warn() { printf "${Y}[WARN]${N}  %s\n" "$1"; }
fail() { printf "${R}[FAIL]${N}  %s\n" "$1"; }
info() { printf "${C}[INFO]${N}  %s\n" "$1"; }

mask_key() {
  local k="$1" n=${#1}
  (( n <= 10 )) && printf '%s' "$k" && return
  printf '%s...%s' "${k:0:6}" "${k:n-4:4}"
}

check_port() {
  local port="$1"
  if command -v nc >/dev/null 2>&1; then
    nc -z -w2 127.0.0.1 "$port" 2>/dev/null && return 0
  fi
  curl -sf --max-time 3 -o /dev/null "http://127.0.0.1:${port}/" 2>/dev/null && return 0
  # Port might respond with non-2xx but still be listening
  local code
  code=$(curl -sf --max-time 3 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${port}/" 2>/dev/null || echo "000")
  [[ "$code" != "000" ]] && return 0
  return 1
}

http_status() {
  local url="$1" hdr="${2:-}" code
  if [[ -n "$hdr" ]]; then
    code=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" -H "$hdr" "$url" 2>/dev/null) || true
  else
    code=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null) || true
  fi
  echo "${code:-000}"
}

upsert_env() {
  local key="$1" value="$2"
  if grep -qE "^#?\s*${key}=" "$ENV_FILE" 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^#*[[:space:]]*${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      sed -i "s|^#*\s*${key}=.*|${key}=${value}|" "$ENV_FILE"
    fi
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

read_env() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] && grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- || true
}

# ─── Banner ───────────────────────────────────────────────────────────────

printf '\n'
printf '  ╔═══════════════════════════════════════════════╗\n'
printf '  ║      CRM Environment Configurator            ║\n'
printf '  ╚═══════════════════════════════════════════════╝\n'
printf '\n'

# ─── Ensure .env ──────────────────────────────────────────────────────────

if [[ ! -f "$ENV_FILE" ]]; then
  if $CHECK_ONLY; then
    fail "No .env file at ${ENV_FILE}"
    exit 2
  fi
  if [[ -f "$ENV_EXAMPLE_FILE" ]]; then
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    info "Created .env from .env.example"
  else
    touch "$ENV_FILE"
    info "Created empty .env"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# 1. Twenty CRM
# ═══════════════════════════════════════════════════════════════════════════

info "Checking Twenty CRM..."

# Resolve URL: env override > .env file > auto-detect > default
TWENTY_URL="${TWENTY_API_URL:-$(read_env TWENTY_API_URL)}"

if [[ -z "$TWENTY_URL" ]]; then
  if check_port "$DEFAULT_TWENTY_PORT"; then
    TWENTY_URL="$DEFAULT_TWENTY_URL"
    ok "Twenty CRM auto-detected on port ${DEFAULT_TWENTY_PORT}"
  elif command -v docker >/dev/null 2>&1; then
    DPORT=$(docker ps --filter "name=twenty" --format "{{.Ports}}" 2>/dev/null \
      | grep -oE '0\.0\.0\.0:[0-9]+->3000' | head -1 | cut -d: -f2 | cut -d- -f1 || true)
    if [[ -n "$DPORT" ]]; then
      TWENTY_URL="http://127.0.0.1:${DPORT}"
      ok "Twenty Docker container found on port ${DPORT}"
    fi
  fi
fi

[[ -z "$TWENTY_URL" ]] && TWENTY_URL="$DEFAULT_TWENTY_URL" && warn "Using default: ${DEFAULT_TWENTY_URL}"

# Resolve API key: env override > .env file
TWENTY_KEY="${TWENTY_API_KEY:-$(read_env TWENTY_API_KEY)}"

# Reachability
TWENTY_OK=false
TWENTY_PORT=$(echo "$TWENTY_URL" | grep -oE '[0-9]+$' || echo "$DEFAULT_TWENTY_PORT")
if check_port "$TWENTY_PORT"; then
  # Try known Twenty health endpoints
  for path in "/healthz" "/api" "/"; do
    hs=$(http_status "${TWENTY_URL}${path}")
    if [[ "$hs" != "000" ]]; then
      ok "Twenty CRM reachable at ${TWENTY_URL} (${path} → HTTP ${hs})"
      TWENTY_OK=true
      break
    fi
  done
  if ! $TWENTY_OK; then
    warn "Twenty port ${TWENTY_PORT} open but no HTTP response"
    EXIT_CODE=1
  fi
else
  fail "Twenty CRM NOT reachable at ${TWENTY_URL}"
  EXIT_CODE=1
fi

# Validate API key against REST endpoint
TWENTY_KEY_OK=false
if [[ -n "$TWENTY_KEY" ]] && $TWENTY_OK; then
  ks=$(http_status "${TWENTY_URL}/rest/people?limit=1" "Authorization: Bearer ${TWENTY_KEY}")
  case "$ks" in
    2*) ok "Twenty API key valid (HTTP ${ks})"; TWENTY_KEY_OK=true ;;
    401|403) fail "Twenty API key REJECTED (HTTP ${ks}) — expired or wrong key"; EXIT_CODE=1 ;;
    *) warn "Twenty API key check returned HTTP ${ks}" ;;
  esac
elif [[ -z "$TWENTY_KEY" ]]; then
  warn "No TWENTY_API_KEY — CRM features disabled until key is set"
  EXIT_CODE=1
fi

# ═══════════════════════════════════════════════════════════════════════════
# 2. PA Workspace
# ═══════════════════════════════════════════════════════════════════════════

printf '\n'
info "Checking PA Workspace..."

PA_URL="${PA_WORKSPACE_API_URL:-$(read_env PA_WORKSPACE_API_URL)}"

if [[ -z "$PA_URL" ]]; then
  if check_port "$DEFAULT_PA_PORT"; then
    PA_URL="$DEFAULT_PA_URL"
    ok "PA Workspace auto-detected on port ${DEFAULT_PA_PORT}"
  fi
fi

[[ -z "$PA_URL" ]] && PA_URL="$DEFAULT_PA_URL" && warn "Using default: ${DEFAULT_PA_URL}"

PA_OK=false
PA_PORT=$(echo "$PA_URL" | grep -oE '[0-9]+$' || echo "$DEFAULT_PA_PORT")
if check_port "$PA_PORT"; then
  for path in "/health" "/api/health" "/"; do
    hs=$(http_status "${PA_URL}${path}")
    if [[ "$hs" != "000" ]]; then
      ok "PA Workspace reachable at ${PA_URL} (${path} → HTTP ${hs})"
      PA_OK=true
      break
    fi
  done
  if ! $PA_OK; then
    warn "PA Workspace port open but health check failed"
    PA_OK=true  # Port responds, probably running
  fi
else
  warn "PA Workspace NOT reachable at ${PA_URL} — email/calendar features unavailable"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. Write .env
# ═══════════════════════════════════════════════════════════════════════════

if ! $CHECK_ONLY; then
  printf '\n'
  info "Writing to ${ENV_FILE}..."

  upsert_env "TWENTY_API_URL" "$TWENTY_URL"
  [[ -n "$TWENTY_KEY" ]] && upsert_env "TWENTY_API_KEY" "$TWENTY_KEY"
  upsert_env "PA_WORKSPACE_API_URL" "$PA_URL"

  chmod 600 "$ENV_FILE" 2>/dev/null || true
  ok "Environment file updated"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 4. Summary
# ═══════════════════════════════════════════════════════════════════════════

printf '\n'
printf '  ┌───────────────────────────────────────────────┐\n'
printf '  │  Configuration Summary                        │\n'
printf '  ├───────────────────────────────────────────────┤\n'
printf "  │  TWENTY_API_URL   = %-25s│\n" "$TWENTY_URL"
if [[ -n "$TWENTY_KEY" ]]; then
  printf "  │  TWENTY_API_KEY   = %-25s│\n" "$(mask_key "$TWENTY_KEY")"
else
  printf "  │  TWENTY_API_KEY   = %-25s│\n" "(not set)"
fi
printf "  │  PA_WORKSPACE_URL = %-25s│\n" "$PA_URL"
printf '  ├───────────────────────────────────────────────┤\n'

if $TWENTY_OK && $TWENTY_KEY_OK && $PA_OK; then
  printf "  │  ${G}All services reachable and configured${N}       │\n"
elif $TWENTY_OK && $TWENTY_KEY_OK; then
  printf "  │  ${Y}Twenty OK — PA Workspace unreachable${N}        │\n"
elif $TWENTY_OK; then
  printf "  │  ${Y}Twenty reachable — API key missing/bad${N}      │\n"
else
  printf "  │  ${R}Twenty CRM unreachable${N}                      │\n"
fi
printf '  └───────────────────────────────────────────────┘\n'

# Next steps
printf '\n'
if ! $TWENTY_OK; then
  info "Next: Start Twenty CRM (docker compose up -d)"
fi
if [[ -z "$TWENTY_KEY" ]]; then
  info "Next: Set TWENTY_API_KEY (from Twenty admin → Settings → API Keys)"
fi
if ! $PA_OK; then
  info "Note: PA Workspace optional — only needed for email/calendar"
fi
if (( EXIT_CODE == 0 )); then
  ok "Run 'npm run crm:check' for deep TypeScript-level verification"
else
  info "Fix above issues, then 'npm run crm:check' for deep verification"
fi
printf '\n'

exit $EXIT_CODE
