import { db } from "./db.js";
import { getLeaderSalesUserIds } from "./leaderTeam.js";
import {
  getMerchantInsightStatus,
  parseUnreadAlertPeriods,
  type MerchantInsightStatus,
  type SalesInsightCounts,
} from "./merchantInsights.js";

export type PeriodType = "day" | "week" | "month";

/** 商户详情页各维度展示窗口 */
export const MERCHANT_PERIOD_RANGE: Record<PeriodType, number> = {
  day: 31,
  week: 8,
  month: 3,
};

export function getMerchantPeriodRangeLabel(period: PeriodType): string {
  const n = MERCHANT_PERIOD_RANGE[period];
  if (period === "day") return `近${n}日`;
  if (period === "week") return `近${n}周`;
  return `近${n}個月`;
}

/** 环比对比口径说明 */
export function getPeriodChangeCompareLabel(period: PeriodType): string {
  if (period === "day") return "前30日均值 vs 昨日";
  if (period === "week") return "上週 vs 上上週";
  return "上月 vs 上上月";
}

/** 环比百分比，保留 1 位小数 */
export function formatChangePercent(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

const DAY_BASELINE_DAYS = 30;

function roundAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function queryDayAmount(
  merchantId: number,
  ymd: string
): { amount: number; count: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as amount, COUNT(*) as count
       FROM transactions
       WHERE merchant_id = ? AND substr(txn_time, 1, 10) = ?`
    )
    .get(merchantId, ymd) as { amount: number; count: number };
  return row;
}

function queryRangeAmount(
  merchantId: number,
  startYmd: string,
  endYmd: string
): { amount: number; count: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as amount, COUNT(*) as count
       FROM transactions
       WHERE merchant_id = ? AND substr(txn_time, 1, 10) >= ? AND substr(txn_time, 1, 10) <= ?`
    )
    .get(merchantId, startYmd, endYmd) as { amount: number; count: number };
  return row;
}

function queryMonthAmount(
  merchantId: number,
  ym: string
): { amount: number; count: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as amount, COUNT(*) as count
       FROM transactions
       WHERE merchant_id = ? AND strftime('%Y-%m', txn_time) = ?`
    )
    .get(merchantId, ym) as { amount: number; count: number };
  return row;
}

function toBucket(
  label: string,
  amount: number,
  count: number,
  start: Date,
  end: Date
): PeriodBucket {
  return {
    label,
    start: startOfDay(start).toISOString(),
    end: startOfDay(end).toISOString(),
    amount: roundAmount(amount),
    count,
  };
}

function calcChangePercent(current: number, baseline: number): number | null {
  if (baseline !== 0) {
    return Math.round(((current - baseline) / baseline) * 1000) / 10;
  }
  if (current > 0) return 100;
  return 0;
}

function getDayPeriodChange(merchantId: number) {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const yYmd = isoDate(yesterday);
  const yData = queryDayAmount(merchantId, yYmd);

  let sum = 0;
  for (let i = 2; i <= DAY_BASELINE_DAYS + 1; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    sum += queryDayAmount(merchantId, isoDate(d)).amount;
  }
  const avg = sum / DAY_BASELINE_DAYS;

  const baselineStart = new Date(today);
  baselineStart.setDate(today.getDate() - (DAY_BASELINE_DAYS + 1));
  const baselineEnd = new Date(today);
  baselineEnd.setDate(today.getDate() - 2);

  const current = toBucket("昨日", yData.amount, yData.count, yesterday, yesterday);
  const previous = toBucket(
    "前30日均值",
    avg,
    0,
    baselineStart,
    baselineEnd
  );

  return { current, previous, changePercent: calcChangePercent(yData.amount, avg) };
}

function getWeekPeriodChange(merchantId: number) {
  const today = startOfDay(new Date());
  const day = today.getDay() || 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - day + 1);

  const lastWeekStart = new Date(thisMonday);
  lastWeekStart.setDate(thisMonday.getDate() - 7);
  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekStart.getDate() + 6);

  const prevWeekStart = new Date(thisMonday);
  prevWeekStart.setDate(thisMonday.getDate() - 14);
  const prevWeekEnd = new Date(prevWeekStart);
  prevWeekEnd.setDate(prevWeekStart.getDate() + 6);

  const curData = queryRangeAmount(
    merchantId,
    isoDate(lastWeekStart),
    isoDate(lastWeekEnd)
  );
  const prevData = queryRangeAmount(
    merchantId,
    isoDate(prevWeekStart),
    isoDate(prevWeekEnd)
  );

  const current = toBucket(
    labelForKey(weekKey(lastWeekStart), "week"),
    curData.amount,
    curData.count,
    lastWeekStart,
    lastWeekEnd
  );
  const previous = toBucket(
    labelForKey(weekKey(prevWeekStart), "week"),
    prevData.amount,
    prevData.count,
    prevWeekStart,
    prevWeekEnd
  );

  return {
    current,
    previous,
    changePercent: calcChangePercent(curData.amount, prevData.amount),
  };
}

function getMonthPeriodChange(merchantId: number) {
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 2, 1);

  const curYm = monthKey(lastMonth);
  const prevYm = monthKey(prevMonth);
  const curData = queryMonthAmount(merchantId, curYm);
  const prevData = queryMonthAmount(merchantId, prevYm);

  const lastMonthEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
  const prevMonthEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);

  const current = toBucket(
    labelForKey(curYm, "month"),
    curData.amount,
    curData.count,
    lastMonth,
    lastMonthEnd
  );
  const previous = toBucket(
    labelForKey(prevYm, "month"),
    prevData.amount,
    prevData.count,
    prevMonth,
    prevMonthEnd
  );

  return {
    current,
    previous,
    changePercent: calcChangePercent(curData.amount, prevData.amount),
  };
}

export interface PeriodBucket {
  label: string;
  start: string;
  end: string;
  amount: number;
  count: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function weekKey(d: Date): string {
  const day = d.getDay() || 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + 1);
  return `W${isoDate(monday)}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketKey(date: Date, period: PeriodType): string {
  if (period === "day") return isoDate(date);
  if (period === "week") return weekKey(date);
  return monthKey(date);
}

function labelForKey(key: string, period: PeriodType): string {
  if (period === "day") {
    const d = parseYmd(key);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  if (period === "week") {
    const start = parseYmd(key.slice(1));
    return `${start.getMonth() + 1}/${start.getDate()}周`;
  }
  const [y, m] = key.split("-");
  const now = new Date();
  if (Number(y) === now.getFullYear()) return `${Number(m)}月`;
  return `${y}年${Number(m)}月`;
}

function generatePeriodKeys(period: PeriodType, count: number): string[] {
  const today = startOfDay(new Date());

  if (period === "day") {
    const keys: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      keys.push(isoDate(d));
    }
    return keys;
  }

  if (period === "week") {
    const day = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - day + 1);
    const keys: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const ws = new Date(monday);
      ws.setDate(monday.getDate() - i * 7);
      keys.push(weekKey(ws));
    }
    return keys;
  }

  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

function bucketBounds(key: string, period: PeriodType): { start: Date; end: Date } {
  if (period === "day") {
    const d = parseYmd(key);
    return { start: d, end: d };
  }
  if (period === "week") {
    const start = parseYmd(key.slice(1));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }
  const [y, m] = key.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
}

export function getMerchantPeriodSeries(
  merchantId: number,
  period: PeriodType,
  limit?: number
): PeriodBucket[] {
  const count = limit ?? MERCHANT_PERIOD_RANGE[period];
  const keys = generatePeriodKeys(period, count);
  const keySet = new Set(keys);
  const totals = new Map<string, { amount: number; count: number }>();
  for (const k of keys) totals.set(k, { amount: 0, count: 0 });

  const txns = db
    .prepare(
      `SELECT txn_time, amount FROM transactions WHERE merchant_id = ? ORDER BY txn_time ASC`
    )
    .all(merchantId) as { txn_time: string; amount: number }[];

  for (const t of txns) {
    const d = new Date(t.txn_time);
    const key = bucketKey(d, period);
    if (!keySet.has(key)) continue;
    const cur = totals.get(key)!;
    cur.amount += t.amount;
    cur.count += 1;
  }

  return keys.map((key) => {
    const v = totals.get(key)!;
    const { start, end } = bucketBounds(key, period);
    return {
      label: labelForKey(key, period),
      start: startOfDay(start).toISOString(),
      end: startOfDay(end).toISOString(),
      amount: Math.round(v.amount * 100) / 100,
      count: v.count,
    };
  });
}

export function getPeriodChange(
  merchantId: number,
  period: PeriodType
): {
  current: PeriodBucket | null;
  previous: PeriodBucket | null;
  changePercent: number | null;
} {
  if (period === "day") return getDayPeriodChange(merchantId);
  if (period === "week") return getWeekPeriodChange(merchantId);
  return getMonthPeriodChange(merchantId);
}

export interface MerchantSummary {
  id: number;
  name: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string | null;
  lastMonthAmount: number;
  mtdAmount: number;
  dailyAvgChangePercent: number | null;
  mtdCardAmount: number;
  mtdScanAmount: number;
  cardLimit: number | null;
  scanLimit: number | null;
  cardLimitPercent: number | null;
  scanLimitPercent: number | null;
  status: MerchantInsightStatus;
  hasUnreadAlert: boolean;
  unreadAlertPeriods: Array<"week" | "month">;
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 本月 1 日 00:00 至昨日 23:59（本地日曆） */
function getMtdThroughYesterdayRange(): { start: string; end: string; days: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  if (yesterday < monthStart) {
    return { start: formatLocalYmd(monthStart), end: formatLocalYmd(monthStart), days: 0 };
  }

  return {
    start: formatLocalYmd(monthStart),
    end: formatLocalYmd(yesterday),
    days: yesterday.getDate(),
  };
}

function daysInPreviousCalendarMonth(): number {
  const d = new Date();
  d.setDate(0);
  return d.getDate();
}

/** 本月截至昨日標籤，如「6月1日–4日」 */
export function getMtdThroughYesterdayLabel(): string {
  const now = new Date();
  const { end, days } = getMtdThroughYesterdayRange();
  const month = now.getMonth() + 1;
  if (days === 0) return `${month}月（今日為月初，暫無本月數據）`;
  const endDay = Number(end.slice(8, 10));
  if (endDay <= 1) return `${month}月1日`;
  return `${month}月1日–${endDay}日`;
}

export function getCurrentMonthLabel(): string {
  return `${new Date().getMonth() + 1}月`;
}

function previousCalendarMonthYm(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 商户排名所用月份标签，如「5月」 */
export function getMerchantRankMonthLabel(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getMonth() + 1}月`;
}

function merchantListAccessClause(role: string, userId: number): { where: string; params: number[] } {
  if (role === "admin") return { where: "", params: [] };
  if (role === "leader") {
    const teamIds = getLeaderSalesUserIds(userId);
    const ids = [userId, ...teamIds];
    const placeholders = ids.map(() => "?").join(", ");
    return { where: `WHERE m.sales_user_id IN (${placeholders})`, params: ids };
  }
  return { where: "WHERE m.sales_user_id = ?", params: [userId] };
}

function limitPercent(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.round((used / limit) * 1000) / 10;
}

export function listMerchantsForUser(userId: number, role: string): MerchantSummary[] {
  const ym = previousCalendarMonthYm();
  const mtd = getMtdThroughYesterdayRange();
  const lastMonthDays = daysInPreviousCalendarMonth();
  const access = merchantListAccessClause(role, userId);

  const mtdCase = `CASE WHEN substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ? THEN t.amount ELSE 0 END`;
  const mtdCardCase = `CASE WHEN substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ? AND t.payment_channel = 'card' THEN t.amount ELSE 0 END`;
  const mtdScanCase = `CASE WHEN substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ? AND t.payment_channel = 'scan' THEN t.amount ELSE 0 END`;

  const sql = `
    SELECT m.id, m.name, m.merchant_code as merchantCode, m.sales_user_id as salesUserId,
      m.sales_name as salesName,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.txn_time) = ? THEN t.amount ELSE 0 END), 0) as lastMonthAmount,
      COALESCE(SUM(${mtdCase}), 0) as mtdAmount,
      COALESCE(SUM(${mtdCardCase}), 0) as mtdCardAmount,
      COALESCE(SUM(${mtdScanCase}), 0) as mtdScanAmount,
      l.card_limit as cardLimit,
      l.scan_limit as scanLimit,
      EXISTS(
        SELECT 1 FROM alerts a
        WHERE a.merchant_id = m.id AND a.acknowledged = 0 AND a.period IN ('week', 'month')
      ) as hasUnreadAlert,
      (
        SELECT GROUP_CONCAT(DISTINCT a.period)
        FROM alerts a
        WHERE a.merchant_id = m.id AND a.acknowledged = 0 AND a.period IN ('week', 'month')
      ) as unreadAlertPeriodsRaw
    FROM merchants m
    LEFT JOIN transactions t ON t.merchant_id = m.id
    LEFT JOIN merchant_channel_limits l ON l.merchant_code = m.merchant_code
      AND m.merchant_code IS NOT NULL AND TRIM(m.merchant_code) != ''
    ${access.where}
    GROUP BY m.id
    ORDER BY lastMonthAmount DESC, m.name ASC`;

  const params = [
    ym,
    mtd.start,
    mtd.end,
    mtd.start,
    mtd.end,
    mtd.start,
    mtd.end,
    ...access.params,
  ];

  const rows = db.prepare(sql).all(...params) as unknown as Array<
    Omit<
      MerchantSummary,
      | "dailyAvgChangePercent"
      | "cardLimitPercent"
      | "scanLimitPercent"
      | "status"
      | "hasUnreadAlert"
      | "unreadAlertPeriods"
    > & {
      hasUnreadAlert: number;
      unreadAlertPeriodsRaw: string | null;
    }
  >;

  return rows.map((r) => {
    const lastMonthAmount = Math.round(r.lastMonthAmount * 100) / 100;
    const mtdAmount = Math.round(r.mtdAmount * 100) / 100;
    const mtdCardAmount = Math.round(r.mtdCardAmount * 100) / 100;
    const mtdScanAmount = Math.round(r.mtdScanAmount * 100) / 100;
    let dailyAvgChangePercent: number | null = null;

    if (mtd.days > 0 && lastMonthDays > 0 && lastMonthAmount !== 0) {
      const currentDailyAvg = mtdAmount / mtd.days;
      const lastMonthDailyAvg = lastMonthAmount / lastMonthDays;
      if (lastMonthDailyAvg !== 0) {
        dailyAvgChangePercent =
          Math.round(((currentDailyAvg - lastMonthDailyAvg) / lastMonthDailyAvg) * 1000) / 10;
      }
    }

    return {
      id: r.id,
      name: r.name,
      merchantCode: r.merchantCode,
      salesUserId: r.salesUserId,
      salesName: r.salesName,
      lastMonthAmount,
      mtdAmount,
      dailyAvgChangePercent,
      mtdCardAmount,
      mtdScanAmount,
      cardLimit: r.cardLimit,
      scanLimit: r.scanLimit,
      cardLimitPercent: limitPercent(mtdCardAmount, r.cardLimit),
      scanLimitPercent: limitPercent(mtdScanAmount, r.scanLimit),
      status: getMerchantInsightStatus(lastMonthAmount, mtdAmount, dailyAvgChangePercent),
      hasUnreadAlert: r.hasUnreadAlert === 1,
      unreadAlertPeriods: parseUnreadAlertPeriods(r.unreadAlertPeriodsRaw),
    };
  });
}

export interface SalesHomeInsightSnapshot {
  mtdLabel: string;
  mtdAmount: number;
  dailyAvgChangePercent: number | null;
  insightSummary: SalesInsightCounts;
  unreadAlertMerchantCount: number;
}

/** 销售/主管工作台：本月摘要与商户洞察计数 */
export function getSalesHomeInsightSnapshot(
  userId: number,
  role: string
): SalesHomeInsightSnapshot | null {
  if (role !== "sales" && role !== "leader") return null;

  const merchants = listMerchantsForUser(userId, role);
  const mtdAmount = Math.round(merchants.reduce((sum, m) => sum + m.mtdAmount, 0) * 100) / 100;
  const lastMonthAmount = merchants.reduce((sum, m) => sum + m.lastMonthAmount, 0);
  const mtd = getMtdThroughYesterdayRange();
  const lastMonthDays = daysInPreviousCalendarMonth();

  let dailyAvgChangePercent: number | null = null;
  if (mtd.days > 0 && lastMonthDays > 0 && lastMonthAmount > 0) {
    const currentDailyAvg = mtdAmount / mtd.days;
    const lastMonthDailyAvg = lastMonthAmount / lastMonthDays;
    dailyAvgChangePercent =
      Math.round(((currentDailyAvg - lastMonthDailyAvg) / lastMonthDailyAvg) * 1000) / 10;
  }

  return {
    mtdLabel: getMtdThroughYesterdayLabel(),
    mtdAmount,
    dailyAvgChangePercent,
    insightSummary: {
      assignedMerchantCount: merchants.length,
      activeMerchantCount: merchants.filter((m) => m.mtdAmount > 0).length,
      newSilentCount: merchants.filter((m) => m.status === "newSilent").length,
      decliningCount: merchants.filter((m) => m.status === "declining").length,
      risingCount: merchants.filter((m) => m.status === "rising").length,
    },
    unreadAlertMerchantCount: merchants.filter((m) => m.hasUnreadAlert).length,
  };
}

export interface MonthStat {
  year: number;
  month: number;
  label: string;
  chartLabel: string;
  totalAmount: number;
  txnCount: number;
  merchantCount: number;
  isCurrent: boolean;
  weeks: WeekStat[];
}

function monthWhereClause(role: string): string {
  const base = `FROM transactions t JOIN merchants m ON m.id = t.merchant_id WHERE strftime('%Y-%m', t.txn_time) = ?`;
  return role === "admin" ? base : `${base} AND m.sales_user_id = ?`;
}

function queryDateRange(
  userId: number,
  role: string,
  startInclusive: string,
  endInclusive: string
): { totalAmount: number; txnCount: number; merchantCount: number } {
  const sql =
    role === "admin"
      ? `SELECT COALESCE(SUM(t.amount), 0) as totalAmount, COUNT(t.id) as txnCount,
         COUNT(DISTINCT m.id) as merchantCount
         FROM transactions t JOIN merchants m ON m.id = t.merchant_id
         WHERE substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ?`
      : `SELECT COALESCE(SUM(t.amount), 0) as totalAmount, COUNT(t.id) as txnCount,
         COUNT(DISTINCT m.id) as merchantCount
         FROM transactions t JOIN merchants m ON m.id = t.merchant_id
         WHERE substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ?
         AND m.sales_user_id = ?`;

  const row = (
    role === "admin"
      ? db.prepare(sql).get(startInclusive, endInclusive)
      : db.prepare(sql).get(startInclusive, endInclusive, userId)
  ) as { totalAmount: number; txnCount: number; merchantCount: number };

  return {
    totalAmount: Math.round(row.totalAmount * 100) / 100,
    txnCount: row.txnCount,
    merchantCount: row.merchantCount,
  };
}

function queryCalendarMonth(
  userId: number,
  role: string,
  year: number,
  month: number
): { totalAmount: number; txnCount: number; merchantCount: number } {
  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  if (isCurrent) {
    const range = getMtdThroughYesterdayRange();
    if (range.days === 0) {
      return { totalAmount: 0, txnCount: 0, merchantCount: 0 };
    }
    return queryDateRange(userId, role, range.start, range.end);
  }

  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const sql = `SELECT COALESCE(SUM(t.amount), 0) as totalAmount, COUNT(t.id) as txnCount,
    COUNT(DISTINCT m.id) as merchantCount ${monthWhereClause(role)}`;
  const row = (
    role === "admin"
      ? db.prepare(sql).get(ym)
      : db.prepare(sql).get(ym, userId)
  ) as { totalAmount: number; txnCount: number; merchantCount: number };

  return {
    totalAmount: Math.round(row.totalAmount * 100) / 100,
    txnCount: row.txnCount,
    merchantCount: row.merchantCount,
  };
}

export interface WeekStat {
  label: string;
  totalAmount: number;
  txnCount: number;
}

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 按自然周拆分（每月 4 段，与智付周导出习惯一致） */
export function getMonthWeekBreakdown(
  userId: number,
  role: string,
  year: number,
  month: number
): WeekStat[] {
  const lastDay = new Date(year, month, 0).getDate();
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;

  const ranges: { label: string; start: string; end: string }[] = [
    { label: `${month}/1-${month}/7`, start: dateStr(year, month, 1), end: dateStr(year, month, 8) },
    { label: `${month}/8-${month}/14`, start: dateStr(year, month, 8), end: dateStr(year, month, 15) },
    { label: `${month}/15-${month}/21`, start: dateStr(year, month, 15), end: dateStr(year, month, 22) },
    {
      label: `${month}/22-${month}/${lastDay}`,
      start: dateStr(year, month, 22),
      end: dateStr(nextY, nextM, 1),
    },
  ];

  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
  const todayStr = formatLocalYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate()));

  if (isCurrent && getMtdThroughYesterdayRange().days === 0) {
    return [];
  }

  return ranges
    .map(({ label, start, end }) => {
      let effectiveEnd = end;
      if (isCurrent) {
        if (start >= todayStr) return null;
        if (effectiveEnd > todayStr) effectiveEnd = todayStr;
      }

      const sql =
        role === "admin"
          ? `SELECT COALESCE(SUM(t.amount), 0) as totalAmount, COUNT(t.id) as txnCount
           FROM transactions t JOIN merchants m ON m.id = t.merchant_id
           WHERE substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) < ?`
          : `SELECT COALESCE(SUM(t.amount), 0) as totalAmount, COUNT(t.id) as txnCount
           FROM transactions t JOIN merchants m ON m.id = t.merchant_id
           WHERE substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) < ?
           AND m.sales_user_id = ?`;

      const row = (
        role === "admin"
          ? db.prepare(sql).get(start, effectiveEnd)
          : db.prepare(sql).get(start, effectiveEnd, userId)
      ) as { totalAmount: number; txnCount: number };

      return {
        label,
        totalAmount: Math.round(row.totalAmount * 100) / 100,
        txnCount: row.txnCount,
      };
    })
    .filter((w): w is WeekStat => w !== null);
}

/** 最近 N 个自然月（含当月），按时间升序 */
export function getRecentCalendarMonths(count: number): { year: number; month: number }[] {
  const now = new Date();
  const months: { year: number; month: number }[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
}

function monthDisplayLabel(
  year: number,
  month: number,
  isCurrent: boolean,
  currentYear: number
): string {
  if (isCurrent) return `${month}月（截至昨日）`;
  if (year !== currentYear) return `${year}年${month}月`;
  return `${month}月`;
}

function monthChartLabel(year: number, month: number, currentYear: number): string {
  if (year !== currentYear) return `${year}/${month}月`;
  return `${month}月`;
}

/** 指定月份列表的统计（month 为 1–12） */
export function getMonthlyStats(
  userId: number,
  role: string,
  months: { year: number; month: number }[]
): MonthStat[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  return months.map(({ year, month }) => {
    const { totalAmount, txnCount, merchantCount } = queryCalendarMonth(userId, role, year, month);
    const weeks = getMonthWeekBreakdown(userId, role, year, month);
    const isCurrent = year === currentYear && month === currentMonth;
    const label = monthDisplayLabel(year, month, isCurrent, currentYear);
    const chartLabel = monthChartLabel(year, month, currentYear);

    return { year, month, label, chartLabel, totalAmount, txnCount, merchantCount, isCurrent, weeks };
  });
}

/** 工作台：最近三个月（含当月） */
export function getDashboardMonthlyStats(userId: number, role: string): MonthStat[] {
  return getMonthlyStats(userId, role, getRecentCalendarMonths(3));
}
