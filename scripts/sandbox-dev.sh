#!/usr/bin/env bash
# 本地沙箱看板：统一 DATABASE_PATH，避免 .env 指向 app.db 导致登录失败
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_PATH=./data/sandbox-live.db
export PORT=3090
export USE_VITE=1

if [[ -f .env ]]; then
  JWT_SECRET="$(grep -E '^JWT_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  export JWT_SECRET
fi

if [[ -z "${JWT_SECRET:-}" || "${JWT_SECRET}" == "请替换为至少32位随机字符串" ]]; then
  echo "❌ 请在 .env 中设置有效的 JWT_SECRET"
  exit 1
fi

if lsof -ti :3090 >/dev/null 2>&1; then
  echo "重启沙箱：结束旧进程 (端口 3090)…"
  lsof -ti :3090 | xargs kill 2>/dev/null || true
  sleep 1
fi

rm -f data/sandbox-live.db data/sandbox-live.db-wal data/sandbox-live.db-shm

echo "准备沙箱数据…"
npx tsx tools/sandbox-open.ts

echo ""
echo "启动沙箱看板 http://localhost:3090"
exec npx tsx server/index.ts
