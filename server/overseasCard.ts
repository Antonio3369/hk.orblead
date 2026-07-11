import { db } from "./db.js";
import { getLeaderSalesUserIds } from "./leaderTeam.js";
import { OVERSEAS_CARD_TXN_SQL, SUCCESS_CONSUMPTION_TXN_SQL } from "./paymentChannel.js";

export const OVERSEAS_MONTH_RANK_LIMIT = 10;
export const OVERSEAS_REPEAT_BAND_MIN_HKD = 3_500;
export const OVERSEAS_REPEAT_BAND_MAX_HKD = 5_000;
export const OVERSEAS_REPEAT_MIN_TXN_COUNT = 2;
export const OVERSEAS_LARGE_TXN_MIN_HKD = 50_000;
export const OVERSEAS_CARD_SCOPE_NOTE =
  "Visa、Mastercard、銀聯刷卡成功消費（不含交易失敗、不含微信/支付寶掃碼）";

export interface OverseasCardMonthRankRow {
  rank: number;
  id: number;
  name: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string | null;
  totalAmount: number;
  merchantLastMonthTotal: number;
  txnCount: number;
  sharePercent: number;
}

export interface OverseasCardRepeatTxn {
  id: number;
  txnTime: string;
  amount: number;
  orderNo: string | null;
}

export interface OverseasCardRepeatGroup {
  rank: number;
  merchantId: number;
  merchantName: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string | null;
  scheme: "visa" | "mastercard";
  cardNo: string;
  hitCount: number;
  bandAmount: number;
  transactions: OverseasCardRepeatTxn[];
}

export interface OverseasCardLargeTxnRow {
  rank: number;
  id: number;
  merchantId: number;
  merchantName: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string | null;
  scheme: "visa" | "mastercard" | "unionpay";
  txnTime: string;
  amount: number;
  cardNo: string | null;
  orderNo: string | null;
}

function merchantAccessClause(role: string, userId: number, alias = "m"): { clause: string; params: number[] } {
  if (role === "admin") return { clause: "", params: [] };
  if (role === "leader") {
    const ids = [userId, ...getLeaderSalesUserIds(userId)];
    const placeholders = ids.map(() => "?").join(", ");
    return { clause: `AND ${alias}.sales_user_id IN (${placeholders})`, params: ids };
  }
  return { clause: `AND ${alias}.sales_user_id = ?`, params: [userId] };
}

function previousCalendarMonthYm(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function previousCalendarMonthLabel(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

/** 近 3 個自然日（不含今天）：大前天、前天、昨天 */
function getRecentThreeDayRange(): { start: string; end: string; label: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - 3);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const start = fmt(startDay);
  const end = fmt(yesterday);
  return {
    start,
    end,
    label: `${startDay.getMonth() + 1}月${startDay.getDate()}日–${yesterday.getMonth() + 1}月${yesterday.getDate()}日`,
  };
}

function overseasTxnFilters(alias = "t"): string {
  return `${OVERSEAS_CARD_TXN_SQL.replaceAll("t.", `${alias}.`)} AND ${SUCCESS_CONSUMPTION_TXN_SQL.replaceAll("t.", `${alias}.`)}`;
}

function classifySchemeFromRow(payWallet: string | null, txnName: string): "visa" | "mastercard" | "unionpay" {
  const raw = `${payWallet ?? ""} ${txnName}`.toLowerCase();
  if (raw.includes("master") || raw.includes("万事达") || raw.includes("萬事達")) {
    return "mastercard";
  }
  if (raw.includes("visa")) return "visa";
  return "unionpay";
}

function listLastMonthMerchantRank(userId: number, role: string): {
  rankMonth: string;
  rankLimit: number;
  scopeNote: string;
  orgTotal: number;
  merchants: OverseasCardMonthRankRow[];
} {
  const access = merchantAccessClause(role, userId);
  const ym = previousCalendarMonthYm();
  const txnFilter = overseasTxnFilters("t");

  const orgTotalRow = db
    .prepare(
      `
    SELECT COALESCE(SUM(t.amount), 0) as orgTotal
    FROM transactions t
    INNER JOIN merchants m ON m.id = t.merchant_id
    WHERE ${txnFilter}
      AND strftime('%Y-%m', t.txn_time) = ?
      ${access.clause}`
    )
    .get(ym, ...access.params) as { orgTotal: number };
  const orgTotal = Math.round((orgTotalRow?.orgTotal ?? 0) * 100) / 100;

  const sql = `
    SELECT m.id, m.name, m.merchant_code as merchantCode, m.sales_user_id as salesUserId,
      m.sales_name as salesName,
      COALESCE(SUM(CASE WHEN ${OVERSEAS_CARD_TXN_SQL} THEN t.amount ELSE 0 END), 0) as totalAmount,
      COALESCE(SUM(t.amount), 0) as merchantMonthTotal,
      COALESCE(SUM(CASE WHEN ${OVERSEAS_CARD_TXN_SQL} THEN 1 ELSE 0 END), 0) as txnCount
    FROM merchants m
    INNER JOIN transactions t ON t.merchant_id = m.id
      AND strftime('%Y-%m', t.txn_time) = ?
      AND ${SUCCESS_CONSUMPTION_TXN_SQL}
    WHERE 1=1 ${access.clause}
    GROUP BY m.id
    HAVING totalAmount > 0
    ORDER BY totalAmount DESC, m.name ASC
    LIMIT ?`;

  const rows = db.prepare(sql).all(ym, ...access.params, OVERSEAS_MONTH_RANK_LIMIT) as Array<{
    id: number;
    name: string;
    merchantCode: string | null;
    salesUserId: number | null;
    salesName: string | null;
    totalAmount: number;
    merchantMonthTotal: number;
    txnCount: number;
  }>;

  const merchants = rows.map((row, index) => {
    const totalAmount = Math.round(row.totalAmount * 100) / 100;
    const merchantLastMonthTotal = Math.round(row.merchantMonthTotal * 100) / 100;
    return {
      rank: index + 1,
      id: row.id,
      name: row.name,
      merchantCode: row.merchantCode,
      salesUserId: row.salesUserId,
      salesName: row.salesName,
      totalAmount,
      merchantLastMonthTotal,
      txnCount: row.txnCount,
      sharePercent:
        merchantLastMonthTotal > 0
          ? Math.round((totalAmount / merchantLastMonthTotal) * 1000) / 10
          : 0,
    };
  });

  return {
    rankMonth: previousCalendarMonthLabel(),
    rankLimit: OVERSEAS_MONTH_RANK_LIMIT,
    scopeNote: OVERSEAS_CARD_SCOPE_NOTE,
    orgTotal,
    merchants,
  };
}

function listRepeatCardGroups(userId: number, role: string): {
  rangeLabel: string;
  start: string;
  end: string;
  groups: OverseasCardRepeatGroup[];
} {
  const range = getRecentThreeDayRange();
  const access = merchantAccessClause(role, userId);
  const txnFilter = overseasTxnFilters("t");
  const sql = `
    SELECT m.id as merchantId, m.name as merchantName, m.merchant_code as merchantCode,
      m.sales_user_id as salesUserId, m.sales_name as salesName,
      TRIM(t.card_no) as cardNo,
      CASE
        WHEN (
          LOWER(COALESCE(t.pay_wallet, '') || ' ' || COALESCE(t.txn_name, '')) LIKE '%master%'
          OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '万事达') > 0
          OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '萬事達') > 0
        ) THEN 'mastercard'
        WHEN LOWER(COALESCE(t.pay_wallet, '') || ' ' || COALESCE(t.txn_name, '')) LIKE '%visa%' THEN 'visa'
        ELSE NULL
      END as scheme,
      COUNT(*) as hitCount,
      COALESCE(SUM(t.amount), 0) as bandAmount
    FROM transactions t
    INNER JOIN merchants m ON m.id = t.merchant_id
    WHERE ${txnFilter}
      AND substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ?
      AND t.amount >= ? AND t.amount <= ?
      AND t.card_no IS NOT NULL AND TRIM(t.card_no) != ''
      ${access.clause}
    GROUP BY m.id, TRIM(t.card_no), scheme
    HAVING scheme IS NOT NULL AND hitCount >= ?
    ORDER BY hitCount DESC, bandAmount DESC, merchantName ASC`;

  const rows = db.prepare(sql).all(
    range.start,
    range.end,
    OVERSEAS_REPEAT_BAND_MIN_HKD,
    OVERSEAS_REPEAT_BAND_MAX_HKD,
    ...access.params,
    OVERSEAS_REPEAT_MIN_TXN_COUNT
  ) as Array<{
    merchantId: number;
    merchantName: string;
    merchantCode: string | null;
    salesUserId: number | null;
    salesName: string | null;
    cardNo: string;
    scheme: "visa" | "mastercard";
    hitCount: number;
    bandAmount: number;
  }>;

  const txnSql = `
    SELECT t.id, t.txn_time as txnTime, t.amount, t.order_no as orderNo
    FROM transactions t
    WHERE t.merchant_id = ? AND TRIM(t.card_no) = ?
      AND ${overseasTxnFilters("t")}
      AND substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ?
      AND t.amount >= ? AND t.amount <= ?
      AND (
        (? = 'visa' AND LOWER(COALESCE(t.pay_wallet, '') || ' ' || COALESCE(t.txn_name, '')) LIKE '%visa%'
          AND NOT (
            LOWER(COALESCE(t.pay_wallet, '') || ' ' || COALESCE(t.txn_name, '')) LIKE '%master%'
            OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '万事达') > 0
            OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '萬事達') > 0
          ))
        OR (? = 'mastercard' AND (
          LOWER(COALESCE(t.pay_wallet, '') || ' ' || COALESCE(t.txn_name, '')) LIKE '%master%'
          OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '万事达') > 0
          OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '萬事達') > 0
        ))
      )
    ORDER BY t.txn_time DESC`;

  const txnStmt = db.prepare(txnSql);

  const groups = rows.map((row, index) => {
    const transactions = txnStmt.all(
      row.merchantId,
      row.cardNo,
      range.start,
      range.end,
      OVERSEAS_REPEAT_BAND_MIN_HKD,
      OVERSEAS_REPEAT_BAND_MAX_HKD,
      row.scheme,
      row.scheme
    ) as Array<{
      id: number;
      txnTime: string;
      amount: number;
      orderNo: string | null;
    }>;

    return {
      rank: index + 1,
      merchantId: row.merchantId,
      merchantName: row.merchantName,
      merchantCode: row.merchantCode,
      salesUserId: row.salesUserId,
      salesName: row.salesName,
      scheme: row.scheme,
      cardNo: row.cardNo,
      hitCount: row.hitCount,
      bandAmount: Math.round(row.bandAmount * 100) / 100,
      transactions,
    };
  });

  return {
    rangeLabel: range.label,
    start: range.start,
    end: range.end,
    groups,
  };
}

function listLargeTxnRank(userId: number, role: string): {
  rangeLabel: string;
  start: string;
  end: string;
  transactions: OverseasCardLargeTxnRow[];
} {
  const range = getRecentThreeDayRange();
  const access = merchantAccessClause(role, userId);
  const txnFilter = overseasTxnFilters("t");
  const sql = `
    SELECT t.id, m.id as merchantId, m.name as merchantName, m.merchant_code as merchantCode,
      m.sales_user_id as salesUserId, m.sales_name as salesName,
      t.txn_time as txnTime, t.amount, TRIM(t.card_no) as cardNo, t.order_no as orderNo,
      t.pay_wallet as payWallet, t.txn_name as txnName
    FROM transactions t
    INNER JOIN merchants m ON m.id = t.merchant_id
    WHERE ${txnFilter}
      AND substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ?
      AND t.amount >= ?
      ${access.clause}
    ORDER BY t.amount DESC, t.txn_time DESC
    LIMIT 100`;

  const rows = db.prepare(sql).all(range.start, range.end, OVERSEAS_LARGE_TXN_MIN_HKD, ...access.params) as Array<{
    id: number;
    merchantId: number;
    merchantName: string;
    merchantCode: string | null;
    salesUserId: number | null;
    salesName: string | null;
    txnTime: string;
    amount: number;
    cardNo: string | null;
    orderNo: string | null;
    payWallet: string | null;
    txnName: string;
  }>;

  const transactions = rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    merchantCode: row.merchantCode,
    salesUserId: row.salesUserId,
    salesName: row.salesName,
    scheme: classifySchemeFromRow(row.payWallet, row.txnName),
    txnTime: row.txnTime,
    amount: Math.round(row.amount * 100) / 100,
    cardNo: row.cardNo || null,
    orderNo: row.orderNo,
  }));

  return {
    rangeLabel: range.label,
    start: range.start,
    end: range.end,
    transactions,
  };
}

export function getOverseasCardOverview(userId: number, role: string) {
  return {
    lastMonthRank: listLastMonthMerchantRank(userId, role),
    repeatCardHits: listRepeatCardGroups(userId, role),
    largeTransactions: listLargeTxnRank(userId, role),
    thresholds: {
      repeatBandMinHkd: OVERSEAS_REPEAT_BAND_MIN_HKD,
      repeatBandMaxHkd: OVERSEAS_REPEAT_BAND_MAX_HKD,
      repeatMinTxnCount: OVERSEAS_REPEAT_MIN_TXN_COUNT,
      largeTxnMinHkd: OVERSEAS_LARGE_TXN_MIN_HKD,
    },
  };
}
