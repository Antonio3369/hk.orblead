#!/usr/bin/env bash
# 本机一键发版（对齐 alipay：rsync + 远程 docker compose --build）
# 用法：
#   ./deploy/push-and-deploy.sh
#   SKIP_BUILD=1 ./deploy/push-and-deploy.sh   # 已 build 过时跳过
set -euo pipefail

SERVER="${DEPLOY_SERVER:-sales-cloud}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/sales-data-agent}"
REMOTE_STAGING="${DEPLOY_STAGING:-/tmp/hk-orblead-deploy}"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$LOCAL_DIR"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> 本地 npm run build（Dockerfile.prod 需要 dist / dist-server）"
  npm run build
else
  echo "==> 跳过 build（SKIP_BUILD=1）"
fi

if [[ ! -d dist || ! -d dist-server ]]; then
  echo "错误：缺少 dist 或 dist-server，请先 npm run build"
  exit 1
fi

echo "==> 同步到 ${SERVER}:${REMOTE_STAGING}"
# 生产目录常为非 ubuntu 属主（历史 sudo tar），先落到 /tmp 再 sudo 覆盖
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude '.env*' \
  --exclude data \
  --exclude numbers \
  --exclude tools \
  --exclude secrets \
  --exclude release \
  --exclude .cursor \
  --exclude '.DS_Store' \
  --exclude '._*' \
  "${LOCAL_DIR}/" "${SERVER}:${REMOTE_STAGING}/"

echo "==> 以 sudo 覆盖 ${REMOTE_DIR}（保留 .env）"
ssh "${SERVER}" "bash -s" <<REMOTE
set -euo pipefail
sudo mkdir -p "${REMOTE_DIR}"
sudo rsync -a --delete \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude data \
  "${REMOTE_STAGING}/" "${REMOTE_DIR}/"
sudo chmod +x "${REMOTE_DIR}/deploy/server-deploy.sh"
cd "${REMOTE_DIR}"
./deploy/server-deploy.sh
REMOTE

echo ""
echo "==> 完成。请浏览器强制刷新验证 https://hk.orblead.com"
echo "    （直连：http://43.136.25.181:3080）"
