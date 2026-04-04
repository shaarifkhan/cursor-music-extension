#!/bin/sh

set -eu

EVENT_NAME="${1:-stop}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
STATE_FILE="${ROOT_DIR}/.cursor/agent-music-state.json"

mkdir -p "$(dirname "$STATE_FILE")"

cat >"$STATE_FILE" <<EOF
{
  "active": false,
  "event": "${EVENT_NAME}",
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "source": "cursor-hook"
}
EOF
