#!/usr/bin/env bash
# chmod +x tests/e2e-flow.sh
#
# End-to-end test for the full Tez messaging + TIP flow.
# Tests against the production deployment (or override with E2E_BASE_URL).
#
# Usage:
#   bash tests/e2e-flow.sh
#   E2E_BASE_URL=https://staging.mypa.chat bash tests/e2e-flow.sh
#
# Requirements: curl, jq

set -uo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL="${E2E_BASE_URL:-https://app.mypa.chat}"
EMAIL="${E2E_EMAIL:-test@test.com}"
PASSWORD="${E2E_PASSWORD:-testtest1}"

PASS=0
FAIL=0
SKIP=0
TOTAL=0
TIMESTAMP=$(date +%s)

# Stored state across steps
TOKEN=""
USER_ID=""
TEAM_ID=""
TEZ_ID=""
REPLY_ID=""
CARD_ID=""

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: $1 -- $2"
}

skip() {
  SKIP=$((SKIP + 1))
  TOTAL=$((TOTAL + 1))
  echo "  SKIP: $1 -- $2"
}

# Perform a curl request and capture status + body.
# Usage: http_get URL [EXTRA_CURL_ARGS...]
#   Sets: HTTP_STATUS, HTTP_BODY
http_get() {
  local url="$1"; shift
  local tmp
  tmp=$(mktemp)
  HTTP_STATUS=$(curl -s -o "$tmp" -w '%{http_code}' "$@" "$url")
  HTTP_BODY=$(cat "$tmp")
  rm -f "$tmp"
}

# Authenticated GET
auth_get() {
  local url="$1"; shift
  http_get "$url" -H "Authorization: Bearer $TOKEN" "$@"
}

# Authenticated POST with JSON body
auth_post() {
  local url="$1"
  local body="$2"
  shift 2
  local tmp
  tmp=$(mktemp)
  HTTP_STATUS=$(curl -s -o "$tmp" -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$body" \
    "$@" "$url")
  HTTP_BODY=$(cat "$tmp")
  rm -f "$tmp"
}

# ─────────────────────────────────────────────────────────────────────────────
echo "=== MyPA.chat E2E Flow Test ==="
echo "Target: $BASE_URL"
echo "Time:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 1: Health checks
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 1: Health checks"

# 1a: Backend liveness
http_get "$BASE_URL/health/live"
if [ "$HTTP_STATUS" = "200" ] && echo "$HTTP_BODY" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
  pass "Backend liveness (/health/live)"
else
  fail "Backend liveness (/health/live)" "HTTP $HTTP_STATUS: $HTTP_BODY"
fi

# 1b: Relay health
http_get "$BASE_URL/relay/health"
if [ "$HTTP_STATUS" = "200" ] && echo "$HTTP_BODY" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  pass "Relay health (/relay/health)"
else
  fail "Relay health (/relay/health)" "HTTP $HTTP_STATUS: $HTTP_BODY"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 2: Authentication
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 2: Authentication"

tmp_auth=$(mktemp)
HTTP_STATUS=$(curl -s -o "$tmp_auth" -w '%{http_code}' \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  "$BASE_URL/api/auth/login")
HTTP_BODY=$(cat "$tmp_auth")
rm -f "$tmp_auth"

if [ "$HTTP_STATUS" = "200" ]; then
  TOKEN=$(echo "$HTTP_BODY" | jq -r '.data.tokens.accessToken // empty')
  USER_ID=$(echo "$HTTP_BODY" | jq -r '.data.user.id // empty')
  if [ -n "$TOKEN" ] && [ -n "$USER_ID" ]; then
    pass "Login (got token + userId=$USER_ID)"
  else
    fail "Login" "Response missing tokens or user id"
  fi
else
  fail "Login" "HTTP $HTTP_STATUS: $HTTP_BODY"
  echo ""
  echo "FATAL: Cannot continue without authentication. Aborting."
  echo ""
  echo "=== RESULTS: 0/$TOTAL passed, $FAIL failed ==="
  exit 1
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 3: Register as relay contact
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 3: Register as relay contact"

auth_post "$BASE_URL/relay/contacts/register" \
  "{\"displayName\":\"E2E Test User\",\"email\":\"$EMAIL\"}"

if [ "$HTTP_STATUS" = "201" ]; then
  pass "Register relay contact (created)"
elif [ "$HTTP_STATUS" = "409" ]; then
  pass "Register relay contact (already exists, 409 OK)"
else
  # The register endpoint returns 201 for both create and update
  if echo "$HTTP_BODY" | jq -e '.data.id' > /dev/null 2>&1; then
    pass "Register relay contact (updated)"
  else
    fail "Register relay contact" "HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 4: Create a team (or use existing)
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 4: Team setup"

auth_get "$BASE_URL/relay/teams"
if [ "$HTTP_STATUS" = "200" ]; then
  TEAM_COUNT=$(echo "$HTTP_BODY" | jq '.data | length')
  if [ "$TEAM_COUNT" -gt 0 ] 2>/dev/null; then
    TEAM_ID=$(echo "$HTTP_BODY" | jq -r '.data[0].id')
    TEAM_NAME=$(echo "$HTTP_BODY" | jq -r '.data[0].name')
    pass "Found existing team: $TEAM_NAME ($TEAM_ID)"
  else
    # Create a new team
    auth_post "$BASE_URL/relay/teams" "{\"name\":\"E2E Test Team $TIMESTAMP\"}"
    if [ "$HTTP_STATUS" = "201" ]; then
      TEAM_ID=$(echo "$HTTP_BODY" | jq -r '.data.id')
      pass "Created team: E2E Test Team $TIMESTAMP ($TEAM_ID)"
    else
      fail "Create team" "HTTP $HTTP_STATUS: $HTTP_BODY"
    fi
  fi
else
  fail "List teams" "HTTP $HTTP_STATUS: $HTTP_BODY"
fi

if [ -z "$TEAM_ID" ]; then
  echo ""
  echo "WARNING: No team available. Relay Tez tests will be skipped."
  echo ""
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 5: Send a Tez with context layers
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 5: Send a Tez with context layers"

if [ -n "$TEAM_ID" ]; then
  TEZ_SURFACE="E2E test tez - $TIMESTAMP"
  auth_post "$BASE_URL/relay/tez/share" \
    "{
      \"teamId\": \"$TEAM_ID\",
      \"surfaceText\": \"$TEZ_SURFACE\",
      \"type\": \"note\",
      \"urgency\": \"normal\",
      \"context\": [
        {
          \"layer\": \"background\",
          \"content\": \"This is an automated E2E test run at $TIMESTAMP\"
        },
        {
          \"layer\": \"fact\",
          \"content\": \"Testing the full Tez lifecycle\",
          \"confidence\": 95,
          \"source\": \"verified\"
        }
      ]
    }"

  if [ "$HTTP_STATUS" = "201" ]; then
    TEZ_ID=$(echo "$HTTP_BODY" | jq -r '.data.id // empty')
    if [ -n "$TEZ_ID" ]; then
      pass "Sent Tez ($TEZ_ID)"
    else
      fail "Send Tez" "Created but missing id in response"
    fi
  else
    fail "Send Tez" "HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
else
  skip "Send Tez" "No team available"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 6: Retrieve the Tez with context
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 6: Retrieve Tez with context"

if [ -n "$TEZ_ID" ]; then
  auth_get "$BASE_URL/relay/tez/$TEZ_ID"

  if [ "$HTTP_STATUS" = "200" ]; then
    RETURNED_SURFACE=$(echo "$HTTP_BODY" | jq -r '.data.surfaceText // empty')
    CONTEXT_COUNT=$(echo "$HTTP_BODY" | jq '.data.context | length')

    if [ "$RETURNED_SURFACE" = "$TEZ_SURFACE" ]; then
      pass "Tez surfaceText matches"
    else
      fail "Tez surfaceText" "Expected '$TEZ_SURFACE', got '$RETURNED_SURFACE'"
    fi

    if [ "$CONTEXT_COUNT" -ge 2 ] 2>/dev/null; then
      pass "Tez has $CONTEXT_COUNT context layers (expected >= 2)"
    else
      fail "Tez context layers" "Expected >= 2, got $CONTEXT_COUNT"
    fi
  else
    fail "Retrieve Tez" "HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
else
  skip "Retrieve Tez surfaceText" "No Tez ID"
  skip "Retrieve Tez context layers" "No Tez ID"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 7: Reply with threading
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 7: Reply with threading"

if [ -n "$TEZ_ID" ]; then
  auth_post "$BASE_URL/relay/tez/$TEZ_ID/reply" \
    "{
      \"surfaceText\": \"E2E reply - $TIMESTAMP\",
      \"context\": [
        {
          \"layer\": \"fact\",
          \"content\": \"Reply confirms threading works\"
        }
      ]
    }"

  if [ "$HTTP_STATUS" = "201" ]; then
    REPLY_ID=$(echo "$HTTP_BODY" | jq -r '.data.id // empty')
    THREAD_ID=$(echo "$HTTP_BODY" | jq -r '.data.threadId // empty')
    if [ -n "$REPLY_ID" ]; then
      pass "Reply created ($REPLY_ID, thread=$THREAD_ID)"
    else
      fail "Reply" "Created but missing id"
    fi
  else
    fail "Reply" "HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
else
  skip "Reply" "No Tez ID to reply to"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 8: Get thread
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 8: Get thread"

if [ -n "$TEZ_ID" ]; then
  auth_get "$BASE_URL/relay/tez/$TEZ_ID/thread"

  if [ "$HTTP_STATUS" = "200" ]; then
    MSG_COUNT=$(echo "$HTTP_BODY" | jq '.data.messageCount // .data.messages | length')
    if [ "$MSG_COUNT" -ge 2 ] 2>/dev/null; then
      pass "Thread has $MSG_COUNT messages (expected >= 2)"
    else
      fail "Thread message count" "Expected >= 2, got $MSG_COUNT"
    fi
  else
    fail "Get thread" "HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
else
  skip "Get thread" "No Tez ID"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 9: Get team stream
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 9: Get team stream"

if [ -n "$TEAM_ID" ]; then
  auth_get "$BASE_URL/relay/tez/stream?teamId=$TEAM_ID"

  if [ "$HTTP_STATUS" = "200" ]; then
    STREAM_COUNT=$(echo "$HTTP_BODY" | jq '.data | length')
    if [ "$STREAM_COUNT" -ge 1 ] 2>/dev/null; then
      pass "Stream has $STREAM_COUNT tezits"
      # Verify our tez appears in stream
      if [ -n "$TEZ_ID" ]; then
        FOUND=$(echo "$HTTP_BODY" | jq --arg id "$TEZ_ID" '[.data[] | select(.id == $id)] | length')
        if [ "$FOUND" -ge 1 ] 2>/dev/null; then
          pass "Our Tez found in stream"
        else
          fail "Our Tez in stream" "Tez $TEZ_ID not found in stream results"
        fi
      fi
    else
      fail "Team stream" "Expected >= 1 tezits, got $STREAM_COUNT"
    fi
  else
    fail "Team stream" "HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
else
  skip "Team stream" "No team available"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 10: Create a card in backend (for TIP testing)
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 10: Create backend card (for TIP)"

auth_post "$BASE_URL/api/cards/personal" \
  "{\"content\": \"E2E TIP test card - $TIMESTAMP\"}"

if [ "$HTTP_STATUS" = "201" ]; then
  CARD_ID=$(echo "$HTTP_BODY" | jq -r '.data.id // empty')
  if [ -n "$CARD_ID" ]; then
    pass "Created card ($CARD_ID)"
  else
    fail "Create card" "Created but missing id"
  fi
else
  fail "Create card" "HTTP $HTTP_STATUS: $HTTP_BODY"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 11: Share token / public TIP (graceful skip if not implemented)
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 11: Share token (public TIP link)"

if [ -n "$CARD_ID" ]; then
  auth_post "$BASE_URL/api/tez/$CARD_ID/share-with-link" "{}"

  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
    SHARE_TOKEN=$(echo "$HTTP_BODY" | jq -r '.data.shareToken // .data.token // empty')
    if [ -n "$SHARE_TOKEN" ]; then
      pass "Share token generated"
    else
      pass "Share endpoint responded (no token in response body)"
    fi
  elif [ "$HTTP_STATUS" = "404" ]; then
    skip "Share token" "Endpoint not implemented yet (404)"
  else
    fail "Share token" "HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
else
  skip "Share token" "No card ID"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 12: Library search
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 12: Library search"

auth_get "$BASE_URL/api/library/search?q=test"

if [ "$HTTP_STATUS" = "200" ]; then
  HAS_DATA=$(echo "$HTTP_BODY" | jq 'has("data")')
  if [ "$HAS_DATA" = "true" ]; then
    RESULT_COUNT=$(echo "$HTTP_BODY" | jq '.data | length')
    pass "Library search returned $RESULT_COUNT results"
  else
    fail "Library search" "Response missing data field"
  fi
else
  fail "Library search" "HTTP $HTTP_STATUS: $HTTP_BODY"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 13: Unread counts
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 13: Unread counts"

auth_get "$BASE_URL/relay/unread"

if [ "$HTTP_STATUS" = "200" ]; then
  HAS_TOTAL=$(echo "$HTTP_BODY" | jq 'has("data") and (.data | has("total"))')
  if [ "$HAS_TOTAL" = "true" ]; then
    UNREAD_TOTAL=$(echo "$HTTP_BODY" | jq '.data.total')
    pass "Unread counts (total=$UNREAD_TOTAL)"
  else
    fail "Unread counts" "Response missing data.total field"
  fi
else
  fail "Unread counts" "HTTP $HTTP_STATUS: $HTTP_BODY"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 14: Contact search
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 14: Contact search"

auth_get "$BASE_URL/relay/contacts/search?q=test"

if [ "$HTTP_STATUS" = "200" ]; then
  HAS_DATA=$(echo "$HTTP_BODY" | jq 'has("data")')
  if [ "$HAS_DATA" = "true" ]; then
    CONTACT_COUNT=$(echo "$HTTP_BODY" | jq '.data | length')
    pass "Contact search returned $CONTACT_COUNT results"
  else
    fail "Contact search" "Response missing data field"
  fi
else
  fail "Contact search" "HTTP $HTTP_STATUS: $HTTP_BODY"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 15: Contact routing
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 15: Contact routing"

if [ -n "$USER_ID" ]; then
  auth_get "$BASE_URL/relay/contacts/$USER_ID/routing"

  if [ "$HTTP_STATUS" = "200" ]; then
    RECOMMENDED=$(echo "$HTTP_BODY" | jq -r '.data.recommended // empty')
    NATIVE_TEZ=$(echo "$HTTP_BODY" | jq -r '.data.nativeTezAvailable // empty')
    if [ -n "$RECOMMENDED" ]; then
      pass "Contact routing (recommended=$RECOMMENDED, nativeTez=$NATIVE_TEZ)"
    else
      fail "Contact routing" "Response missing recommended field"
    fi
  elif [ "$HTTP_STATUS" = "404" ]; then
    skip "Contact routing" "Contact not found (may not be registered in relay)"
  else
    fail "Contact routing" "HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
else
  skip "Contact routing" "No user ID"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 16: Protocol discovery
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 16: Protocol discovery"

http_get "$BASE_URL/.well-known/tezit.json"

if [ "$HTTP_STATUS" = "200" ]; then
  # Check for tezit_version or protocol_version or version field
  HAS_VERSION=$(echo "$HTTP_BODY" | jq 'has("tezit_version") or has("protocol_version") or has("version")')
  if [ "$HAS_VERSION" = "true" ]; then
    PROTOCOL_VER=$(echo "$HTTP_BODY" | jq -r '.protocol_version // .tezit_version // .version // "unknown"')
    pass "Protocol discovery (version=$PROTOCOL_VER)"
  else
    fail "Protocol discovery" "Response missing version field: $HTTP_BODY"
  fi

  # Verify it has endpoints
  HAS_ENDPOINTS=$(echo "$HTTP_BODY" | jq 'has("endpoints")')
  if [ "$HAS_ENDPOINTS" = "true" ]; then
    pass "Protocol discovery has endpoints"
  else
    fail "Protocol discovery endpoints" "Missing endpoints field"
  fi
else
  fail "Protocol discovery" "HTTP $HTTP_STATUS: $HTTP_BODY"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 17: App root redirect
# ═══════════════════════════════════════════════════════════════════════════

echo "Step 17: App root behavior"

# Check what the root URL returns (could be a redirect or serve the SPA)
ROOT_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -L "$BASE_URL/")
ROOT_HEADERS=$(curl -sI "$BASE_URL/" 2>/dev/null)

if [ "$ROOT_STATUS" = "200" ]; then
  pass "App root returns 200 (SPA served or redirect followed)"
elif [ "$ROOT_STATUS" = "301" ] || [ "$ROOT_STATUS" = "302" ]; then
  LOCATION=$(echo "$ROOT_HEADERS" | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
  pass "App root redirects ($ROOT_STATUS -> $LOCATION)"
else
  fail "App root" "HTTP $ROOT_STATUS (expected 200, 301, or 302)"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

echo "==========================================="
echo "  RESULTS: $PASS passed, $FAIL failed, $SKIP skipped (of $TOTAL)"
echo "==========================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "E2E test suite FAILED."
  exit 1
else
  echo ""
  echo "E2E test suite PASSED."
  exit 0
fi
