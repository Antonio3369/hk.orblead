#!/usr/bin/env bash
# 在服务器 /opt/sales-data-agent 执行（由 push-and-deploy.sh 调用）
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "缺少 .env：请先在服务器配置 /opt/sales-data-agent/.env（含 JWT_SECRET）"
  exit 1
fi

if [[ ! -d dist || ! -d dist-server ]]; then
  echo "缺少 dist 或 dist-server：请用本机 ./deploy/push-and-deploy.sh（会先 build 再同步）"
  exit 1
fi

if [[ ! -f docker-compose.yml || ! -f Dockerfile.prod ]]; then
  echo "缺少 docker-compose.yml 或 Dockerfile.prod，中止"
  exit 1
fi

echo "==> docker compose up -d --build"
sudo docker compose up -d --build

echo "==> 容器状态"
sudo docker compose ps

echo "==> 探活（等待进程就绪）"
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -fsS -o /dev/null -I "http://127.0.0.1:3080/"; then
    ok=1
    break
  fi
done
if [[ "$ok" == "1" ]]; then
  curl -sI "http://127.0.0.1:3080/" | head -n 5
  echo "探活 OK"
else
  echo "警告：本机 3080 探活失败，请检查 docker logs"
  sudo docker compose logs --tail 40 app || true
  exit 1
fi
