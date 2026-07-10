#!/usr/bin/env bash
# 在腾讯云服务器安装移卡邮件自动导入 cron（每天 10:25 香港时间）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRON_LINE="25 10 * * * cd ${ROOT} && /usr/bin/docker compose exec -T app node dist-server/emailImport/run.js >> /var/log/sales-email-import.log 2>&1"

if crontab -l 2>/dev/null | grep -q "emailImport/run.js"; then
  echo "cron 已存在，跳过"
  crontab -l | grep "emailImport/run.js"
  exit 0
fi

( crontab -l 2>/dev/null || true
  echo "CRON_TZ=Asia/Hong_Kong"
  echo "$CRON_LINE"
) | crontab -

echo "已安装 cron（每天 10:25 HKT）："
crontab -l | grep -E "CRON_TZ|emailImport"
