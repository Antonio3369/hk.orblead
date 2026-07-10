#!/usr/bin/env bash
# 在服务器 /opt/sales-data-agent 追加移卡邮件自动导入环境变量（不覆盖已有 JWT 等）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ 找不到 $ENV_FILE"
  exit 1
fi

set_kv() {
  local key="$1"
  local val="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    echo "  保留已有 ${key}"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
    echo "  + ${key}"
  fi
}

echo "→ 写入邮件自动导入变量到 $ENV_FILE"

if ! grep -qE '^IMPORT_API_KEY=' "$ENV_FILE"; then
  KEY="$(openssl rand -hex 32)"
  echo "IMPORT_API_KEY=${KEY}" >> "$ENV_FILE"
  echo "  + IMPORT_API_KEY（已自动生成）"
else
  echo "  保留已有 IMPORT_API_KEY"
fi

# 以下三项需人工填写；若环境变量已 export 则写入
[[ -n "${QQ_IMAP_USER:-}" ]] && set_kv "QQ_IMAP_USER" "$QQ_IMAP_USER"
[[ -n "${QQ_IMAP_PASS:-}" ]] && set_kv "QQ_IMAP_PASS" "$QQ_IMAP_PASS"
[[ -n "${EMAIL_IMPORT_NOTIFY_TO:-}" ]] && set_kv "EMAIL_IMPORT_NOTIFY_TO" "$EMAIL_IMPORT_NOTIFY_TO"

set_kv "PUBLIC_SITE_URL" "${PUBLIC_SITE_URL:-https://hk.orblead.com}"
set_kv "DASHBOARD_IMPORT_URL" "${DASHBOARD_IMPORT_URL:-http://127.0.0.1:3080}"

echo ""
echo "请确认 .env 中以下变量已填写："
grep -E '^(IMPORT_API_KEY|QQ_IMAP_USER|QQ_IMAP_PASS|EMAIL_IMPORT_NOTIFY_TO|PUBLIC_SITE_URL|DASHBOARD_IMPORT_URL)=' "$ENV_FILE" \
  | sed 's/QQ_IMAP_PASS=.*/QQ_IMAP_PASS=***/' \
  | sed 's/IMPORT_API_KEY=.*/IMPORT_API_KEY=***/'
