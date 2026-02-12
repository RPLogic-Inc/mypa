#!/usr/bin/env bash
# MyPA Skill Smoke Test
# Validates each capability level against a running MyPA instance.
#
# Usage:
#   export MYPA_API_URL="https://api.mypa.chat"
#   export MYPA_EMAIL="you@example.com"
#   export MYPA_PASSWORD="your-password"
#   # Optional:
#   export RELAY_URL="https://relay.tezit.com"
#
#   bash smoke-test.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { echo -e "  ${RED}FAIL${NC} $1"; FAILURES=$((FAILURES + 1)); }
skip() { echo -e "  ${YELLOW}SKIP${NC} $1"; }

FAILURES=0
TOKEN=""
REFRESH_TOKEN=""

# ═══════════════════════════════════════════════════════════════════
# Pre-flight checks
# ═══════════════════════════════════════════════════════════════════

if [ -z "${MYPA_API_URL:-}" ]; then
  echo "Error: MYPA_API_URL is not set"
  exit 1
fi
if [ -z "${MYPA_EMAIL:-}" ]; then
  echo "Error: MYPA_EMAIL is not set"
  exit 1
fi
if [ -z "${MYPA_PASSWORD:-}" ]; then
  echo "Error: MYPA_PASSWORD is not set"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed"
  exit 1
fi

echo "MyPA Skill Smoke Test"
echo "Target: $MYPA_API_URL"
echo ""

# ═══════════════════════════════════════════════════════════════════
# Level 0: Read-Only
# ═══════════════════════════════════════════════════════════════════

echo "Level 0: Read-Only"

# Auth: login
RESP=$(curl -sf -X POST "$MYPA_API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$MYPA_EMAIL\",\"password\":\"$MYPA_PASSWORD\"}" 2>&1) || true

TOKEN=$(echo "$RESP" | jq -r '.data.tokens.accessToken // empty' 2>/dev/null)
REFRESH_TOKEN=$(echo "$RESP" | jq -r '.data.tokens.refreshToken // empty' 2>/dev/null)

if [ -n "$TOKEN" ]; then
  pass "POST /api/auth/login"
else
  fail "POST /api/auth/login — could not extract token"
  echo "  Response: $RESP"
  echo ""
  echo "Level 0: FAIL (cannot proceed without auth)"
  exit 1
fi

# Auth: bootstrap
RESP=$(curl -sf "$MYPA_API_URL/api/auth/bootstrap" \
  -H "Authorization: Bearer $TOKEN" 2>&1) || true

USER_ID=$(echo "$RESP" | jq -r '.data.user.id // empty' 2>/dev/null)
TEAMS=$(echo "$RESP" | jq -r '.data.teams | length' 2>/dev/null)
INSTANCE_MODE=$(echo "$RESP" | jq -r '.data.instanceMode // empty' 2>/dev/null)

if [ -n "$USER_ID" ] && [ -n "$TEAMS" ]; then
  pass "GET /api/auth/bootstrap (user=$USER_ID, teams=$TEAMS, mode=$INSTANCE_MODE)"
else
  fail "GET /api/auth/bootstrap"
fi

# PA context
RESP=$(curl -sf "$MYPA_API_URL/api/pa/context" \
  -H "Authorization: Bearer $TOKEN" 2>&1) || true

PA_USER=$(echo "$RESP" | jq -r '.data.userName // empty' 2>/dev/null)
if [ -n "$PA_USER" ]; then
  pass "GET /api/pa/context (user=$PA_USER)"
else
  fail "GET /api/pa/context"
fi

# Briefing
RESP=$(curl -sf "$MYPA_API_URL/api/pa/briefing" \
  -H "Authorization: Bearer $TOKEN" 2>&1) || true

PENDING=$(echo "$RESP" | jq -r '.data.pendingCount // "null"' 2>/dev/null)
if [ "$PENDING" != "null" ]; then
  pass "GET /api/pa/briefing (pending=$PENDING)"
else
  fail "GET /api/pa/briefing"
fi

# Feed
RESP=$(curl -sf "$MYPA_API_URL/api/cards/feed?limit=5" \
  -H "Authorization: Bearer $TOKEN" 2>&1) || true

HAS_CARDS=$(echo "$RESP" | jq -r '.cards | type' 2>/dev/null)
if [ "$HAS_CARDS" = "array" ]; then
  CARD_COUNT=$(echo "$RESP" | jq '.cards | length' 2>/dev/null)
  pass "GET /api/cards/feed (count=$CARD_COUNT)"
else
  fail "GET /api/cards/feed"
fi

# Library search
RESP=$(curl -sf "$MYPA_API_URL/api/library/search?q=test" \
  -H "Authorization: Bearer $TOKEN" 2>&1) || true

HAS_RESULTS=$(echo "$RESP" | jq -r '.results | type' 2>/dev/null)
if [ "$HAS_RESULTS" = "array" ]; then
  pass "GET /api/library/search"
else
  fail "GET /api/library/search"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════
# Level 1: Read-Write
# ═══════════════════════════════════════════════════════════════════

echo "Level 1: Read-Write"

# Classify
RESP=$(curl -sf -X POST "$MYPA_API_URL/api/cards/classify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"remind me to buy milk"}' 2>&1) || true

INTENT=$(echo "$RESP" | jq -r '.data.intent // empty' 2>/dev/null)
if [ -n "$INTENT" ]; then
  pass "POST /api/cards/classify (intent=$INTENT)"
else
  fail "POST /api/cards/classify"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════
# Level 2: Relay (Optional)
# ═══════════════════════════════════════════════════════════════════

echo "Level 2: Relay"

if [ -n "${RELAY_URL:-}" ]; then
  # Unread
  RESP=$(curl -sf "$RELAY_URL/unread" \
    -H "Authorization: Bearer $TOKEN" 2>&1) || true

  HAS_UNREAD=$(echo "$RESP" | jq -r '.data // .unread // "null"' 2>/dev/null)
  if [ "$HAS_UNREAD" != "null" ]; then
    pass "GET $RELAY_URL/unread"
  else
    fail "GET $RELAY_URL/unread"
  fi

  # Contacts search
  RESP=$(curl -sf "$RELAY_URL/contacts/search?q=test" \
    -H "Authorization: Bearer $TOKEN" 2>&1) || true

  HAS_CONTACTS=$(echo "$RESP" | jq -r '.data | type' 2>/dev/null)
  if [ "$HAS_CONTACTS" = "array" ]; then
    pass "GET $RELAY_URL/contacts/search"
  else
    fail "GET $RELAY_URL/contacts/search"
  fi
else
  skip "Relay tests (RELAY_URL not set)"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════

echo "─────────────────────────"
if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}All checks passed${NC}"
else
  echo -e "${RED}$FAILURES check(s) failed${NC}"
fi
exit $FAILURES
