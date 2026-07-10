#!/usr/bin/env bash
# Open Design MCP launcher for Cursor — ensures daemon IPC is reachable.
set -euo pipefail

IPC="/tmp/open-design/ipc/release-stable/daemon.sock"
NODE="/Users/antonio/.local/node-v22.15.0-darwin-arm64/bin/node"
OD_BIN="/Applications/Open Design.app/Contents/Resources/app/prebundled/daemon/daemon-cli.mjs"
OD_DATA="/Users/antonio/Library/Application Support/Open Design/namespaces/release-stable/data"

if [[ ! -S "$IPC" ]]; then
  echo "open-design MCP: daemon not running (missing $IPC). Launch Open Design first." >&2
  exit 1
fi

export OD_DATA_DIR="$OD_DATA"
export OD_SIDECAR_IPC_PATH="$IPC"
exec "$NODE" "$OD_BIN" mcp
