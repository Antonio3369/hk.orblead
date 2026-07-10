#!/usr/bin/env bash
# 仅更新前端 dist（小改动时用）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d-%H%M)"
OUT="${1:-$ROOT/release/sales-dist-$STAMP.tgz}"

echo "→ npx vite build"
npx vite build

mkdir -p release

COPYFILE_DISABLE=1 tar czf "$OUT" dist

echo "完成: $OUT"
echo ""
echo "服务器:"
echo "  sudo tar xzf sales-dist-$STAMP.tgz -C /opt/sales-data-agent"
echo "  cd /opt/sales-data-agent && sudo docker compose up -d --build"
