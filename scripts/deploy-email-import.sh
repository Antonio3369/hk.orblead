#!/usr/bin/env bash
# 生产服务器一键：合并 .env → 重建容器 → 试跑邮件导入 → 安装 cron
# 用法（OrcaTerm / SSH，在 /opt/sales-data-agent）：
#   export QQ_IMAP_USER=xxx@qq.com QQ_IMAP_PASS=授权码 EMAIL_IMPORT_NOTIFY_TO=通知邮箱
#   bash scripts/setup-email-import-env.sh
#   bash scripts/deploy-email-import.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ 检查 .env 邮件导入变量"
for v in IMPORT_API_KEY QQ_IMAP_USER QQ_IMAP_PASS EMAIL_IMPORT_NOTIFY_TO; do
  if ! grep -qE "^${v}=.+$" .env 2>/dev/null; then
    echo "❌ .env 缺少 ${v}，请先运行："
    echo "   export QQ_IMAP_USER=... QQ_IMAP_PASS=... EMAIL_IMPORT_NOTIFY_TO=..."
    echo "   bash scripts/setup-email-import-env.sh"
    exit 1
  fi
done

echo "→ docker compose up -d --build"
sudo docker compose up -d --build

echo "→ 等待看板就绪"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3080/api/health >/dev/null 2>&1; then
    echo "  看板 OK"
    break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then
    echo "❌ 看板未响应，请检查 docker compose logs"
    exit 1
  fi
done

echo "→ 手动试跑邮件导入"
sudo docker compose exec -T app node dist-server/emailImport/run.js

echo "→ 安装 cron（每天 10:25 HKT）"
chmod +x scripts/install-email-import-cron.sh
bash scripts/install-email-import-cron.sh

echo ""
echo "✅ 邮件自动导入已上线。日志：tail -f /var/log/sales-email-import.log"
