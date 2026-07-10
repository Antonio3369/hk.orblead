#!/usr/bin/env bash
# 打包完整部署包（Mac 上 build 后上传到腾讯云 /opt/sales-data-agent）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d-%H%M)"
OUT="${1:-$ROOT/release/sales-agent-$STAMP.tgz}"

echo "→ npm run build"
npm run build

mkdir -p release

echo "→ 打包到 $OUT"
COPYFILE_DISABLE=1 tar czf "$OUT" \
  --exclude=node_modules \
  --exclude=data \
  --exclude=.env \
  --exclude=tools \
  --exclude=secrets \
  --exclude=release \
  --exclude=.git \
  --exclude='._*' \
  --exclude=.DS_Store \
  .

echo "完成: $OUT"
echo ""
echo "服务器解压示例:"
echo "  cp /opt/sales-data-agent/.env /tmp/.env.backup"
echo "  sudo tar xzf sales-agent-$STAMP.tgz -C /opt/sales-data-agent"
echo "  cp /tmp/.env.backup /opt/sales-data-agent/.env"
echo "  cd /opt/sales-data-agent && sudo docker compose up -d --build"
