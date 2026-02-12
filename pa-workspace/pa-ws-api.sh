#!/usr/bin/env bash
#
# PA Workspace API shell helper for OpenClaw agent.
# Usage: pa-ws-api.sh <method> <path> [json-body]
#
# Examples:
#   pa-ws-api.sh GET /health/ready
#   pa-ws-api.sh POST /api/admin/setup '{"teamId":"team-1","appApiUrl":"http://localhost:3001"}'
#   pa-ws-api.sh GET /api/identity/user-1
#

set -euo pipefail

PA_WS_URL="${PA_WORKSPACE_URL:-http://localhost:3003}"
TOKEN="${PA_WS_TOKEN:-$TOKEN}"

METHOD="${1:?Usage: pa-ws-api.sh METHOD PATH [BODY]}"
PATH_ARG="${2:?Usage: pa-ws-api.sh METHOD PATH [BODY]}"
BODY="${3:-}"

ARGS=(
  -s
  -X "$METHOD"
  -H "Content-Type: application/json"
  -H "Authorization: Bearer $TOKEN"
)

if [ -n "$BODY" ]; then
  ARGS+=(-d "$BODY")
fi

curl "${ARGS[@]}" "${PA_WS_URL}${PATH_ARG}" | python3 -m json.tool 2>/dev/null || cat
