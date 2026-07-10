/** 交易失敗識別與查詢（狀態非「成功」） */

import { db } from "./db.js";
import { failureRefKey } from "./followUp.js";
import { getLeaderSalesUserIds } from "./leaderTeam.js";

export const FAILURE_WINDOW_DAYS = 3;

export function isFailedStatus(status: string): boolean {
  const s = status.trim();
  if (!s || s === "成功" || s === "交易成功") return false;
  if (s === "退款成功" || s === "撤销成功" || s === "撤銷成功") return false;
  if (s === "交易中" || s === "交易关单" || s === "交易關單") return false;
  return s.includes("失败") || s.includes("失敗");
}

export interface TransactionFailureOrder {
  id: number;
  txnTime: string;
  txnName: string;
  status: string;
  cardRegion: string;
  orderNo: string | null;
  amount: number;
  detail: string | null;
}

export interface MerchantTransactionFailureGroup {
  merchantId: number;
  merchantName: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string;
  failureCount: number;
  failureAmount: number;
  latestTime: string;
  refKey: string;
  orders: TransactionFailureOrder[];
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 不含今天：大前天、前天、昨天 */
export function getThreeDayFailureRange(): { start: string; end: string; label: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - FAILURE_WINDOW_DAYS);

  const start = formatLocalYmd(startDay);
  const end = formatLocalYmd(yesterday);
  const label = `${startDay.getMonth() + 1}月${startDay.getDate()}日–${yesterday.getDate()}日`;
  return { start, end, label };
}

function failureAccessClause(
  role: string,
  userId: number,
  alias: string
): { clause: string; params: number[] } {
  if (role === "admin") return { clause: "", params: [] };
  if (role === "leader") {
    const ids = [userId, ...getLeaderSalesUserIds(userId)];
    const placeholders = ids.map(() => "?").join(", ");
    return { clause: `AND ${alias}.sales_user_id IN (${placeholders})`, params: ids };
  }
  return { clause: `AND ${alias}.sales_user_id = ?`, params: [userId] };
}

export function getTransactionFailureGroups(
  userId: number,
  role: string
): MerchantTransactionFailureGroup[] {
  const range = getThreeDayFailureRange();
  const access = failureAccessClause(role, userId, "m");
  const refKey = failureRefKey(range.start, range.end);

  const sql = `
    SELECT f.id, f.merchant_id, f.txn_time, f.txn_name, f.status, f.card_region,
      f.order_no, f.amount, f.detail,
      m.name as merchant_name,
      m.merchant_code as merchant_code,
      m.sales_user_id as sales_user_id,
      COALESCE(NULLIF(TRIM(m.sales_name), ''), u.display_name, '待分配') as sales_name
    FROM card_failure_events f
    JOIN merchants m ON m.id = f.merchant_id
    LEFT JOIN users u ON u.id = m.sales_user_id
    WHERE substr(f.txn_time, 1, 10) >= ? AND substr(f.txn_time, 1, 10) <= ? ${access.clause}
    ORDER BY f.txn_time DESC
  `;

  const rows = db.prepare(sql).all(range.start, range.end, ...access.params) as Array<{
    id: number;
    merchant_id: number;
    txn_time: string;
    txn_name: string;
    status: string;
    card_region: string;
    order_no: string | null;
    amount: number;
    detail: string | null;
    merchant_name: string;
    merchant_code: string | null;
    sales_user_id: number | null;
    sales_name: string;
  }>;

  const map = new Map<number, MerchantTransactionFailureGroup>();

  for (const r of rows) {
    let g = map.get(r.merchant_id);
    if (!g) {
      g = {
        merchantId: r.merchant_id,
        merchantName: r.merchant_name,
        merchantCode: r.merchant_code,
        salesUserId: r.sales_user_id,
        salesName: r.sales_name,
        failureCount: 0,
        failureAmount: 0,
        latestTime: r.txn_time,
        refKey,
        orders: [],
      };
      map.set(r.merchant_id, g);
    }
    g.failureCount++;
    g.failureAmount = Math.round((g.failureAmount + (r.amount || 0)) * 100) / 100;
    if (r.txn_time > g.latestTime) g.latestTime = r.txn_time;
    g.orders.push({
      id: r.id,
      txnTime: r.txn_time,
      txnName: r.txn_name,
      status: r.status,
      cardRegion: r.card_region || "—",
      orderNo: r.order_no,
      amount: r.amount,
      detail: r.detail,
    });
  }

  return [...map.values()].sort((a, b) => {
    if (b.failureCount !== a.failureCount) return b.failureCount - a.failureCount;
    return b.latestTime.localeCompare(a.latestTime);
  });
}

export function getTransactionFailureSummary(
  userId: number,
  role: string
): { merchantCount: number; failureCount: number; days: number; rangeLabel: string } {
  const range = getThreeDayFailureRange();
  const groups = getTransactionFailureGroups(userId, role);
  const failureCount = groups.reduce((s, g) => s + g.failureCount, 0);
  return {
    merchantCount: groups.length,
    failureCount,
    days: FAILURE_WINDOW_DAYS,
    rangeLabel: range.label,
  };
}
