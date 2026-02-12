#!/usr/bin/env bash
#
# Deploy SKILL.md to OpenClaw workspaces on the server.
# Usage: ./deploy/skill-deploy.sh
#

set -euo pipefail

SERVER="192.241.135.43"
SKILL_FILE="SKILL.md"

# Deploy to all OpenClaw workspaces
for workspace_dir in $(ssh root@$SERVER "ls -d /home/openclaw/.openclaw/workspace-*/skills/ 2>/dev/null || echo ''"); do
  if [ -n "$workspace_dir" ]; then
    DEST="${workspace_dir}pa-workspace/"
    echo "Deploying SKILL.md to $DEST"
    ssh root@$SERVER "mkdir -p $DEST"
    scp "$SKILL_FILE" "root@$SERVER:${DEST}SKILL.md"
    scp "pa-ws-api.sh" "root@$SERVER:${DEST}pa-ws-api.sh"
    ssh root@$SERVER "chmod +x ${DEST}pa-ws-api.sh"
  fi
done

echo "=== Skill deployed ==="
