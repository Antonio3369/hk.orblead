import { db } from "./db.js";
import { getLeaderSalesUserIds, listLeaderTeamSales } from "./leaderTeam.js";
import { listTigerTeamSales } from "./tigerTeam.js";
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

/** 日均環比：上月 < 100 HKD 或为负时，默认按 10 HKD 作底数，避免 ±千万 % */
export const MIN_LAST_MONTH_AMOUNT_FOR_DAILY_COMPARE = 100;
export const DEFAULT_LAST_MONTH_BASELINE_HKD = 10;
export const MAX_DAILY_AVG_CHANGE_PERCENT = 999.9;

export function effectiveLastMonthAmountForDailyCompare(lastMonthAmount: number): number {
  if (lastMonthAmount < MIN_LAST_MONTH_AMOUNT_FOR_DAILY_COMPARE) {
    return DEFAULT_LAST_MONTH_BASELINE_HKD;
  }
  return lastMonthAmount;
}

export function calcDailyAvgChangePercent(
  mtdAmount: number,
  mtdDays: number,
  lastMonthAmount: number,
  lastMonthDays: number
): number | null {
  if (mtdDays <= 0 || lastMonthDays <= 0) return null;

  const baselineAmount = effectiveLastMonthAmountForDailyCompare(lastMonthAmount);
  const currentDailyAvg = mtdAmount / mtdDays;
  const lastMonthDailyAvg = baselineAmount / lastMonthDays;

  const raw = Math.round(((currentDailyAvg - lastMonthDailyAvg) / lastMonthDailyAvg) * 1000) / 10;
  if (!Number.isFinite(raw)) return null;

  return Math.max(
    -MAX_DAILY_AVG_CHANGE_PERCENT,
    Math.min(MAX_DAILY_AVG_CHANGE_PERCENT, raw)
  );
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

function salesUserIdsForRole(role: string, userId: number): number[] | null {
  if (role === "admin") return null;
  if (role === "leader") return [userId, ...getLeaderSalesUserIds(userId)];
  return [userId];
}

/** 工作台个人视图：Leader 按销售身份统计本人数据 */
export function personalDashboardRole(role: string): string {
  return role === "leader" ? "sales" : role;
}

function merchantListAccessClause(role: string, userId: number): { where: string; params: number[] } {
  const ids = salesUserIdsForRole(role, userId);
  if (!ids) return { where: "", params: [] };
  const placeholders = ids.map(() => "?").join(", ");
  return { where: `WHERE m.sales_user_id IN (${placeholders})`, params: ids };
}

function transactionAccessClause(role: string, userId: number): { clause: string; params: number[] } {
  const ids = salesUserIdsForRole(role, userId);
  if (!ids) return { clause: "", params: [] };
  const placeholders = ids.map(() => "?").join(", ");
  return { clause: `AND m.sales_user_id IN (${placeholders})`, params: ids };
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

    if (mtd.days > 0 && lastMonthDays > 0) {
      dailyAvgChangePercent = calcDailyAvgChangePercent(
        mtdAmount,
        mtd.days,
        lastMonthAmount,
        lastMonthDays
      );
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

/** 工作台 Hero / 摘要：Leader 僅統計本人歸屬商戶；銷售同本人；Admin 不走此接口 */
export function getDashboardHomeInsight(userId: number, role: string): SalesHomeInsightSnapshot {
  const merchants =
    role === "leader"
      ? listMerchantsForUser(userId, "sales")
      : listMerchantsForUser(userId, role);
  const mtdAmount = Math.round(merchants.reduce((sum, m) => sum + m.mtdAmount, 0) * 100) / 100;
  const lastMonthAmount = merchants.reduce((sum, m) => sum + m.lastMonthAmount, 0);
  const mtd = getMtdThroughYesterdayRange();
  const lastMonthDays = daysInPreviousCalendarMonth();

  let dailyAvgChangePercent: number | null = null;
  if (mtd.days > 0 && lastMonthDays > 0) {
    dailyAvgChangePercent = calcDailyAvgChangePercent(
      mtdAmount,
      mtd.days,
      lastMonthAmount,
      lastMonthDays
    );
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

/** @deprecated 使用 getDashboardHomeInsight */
export function getSalesHomeInsightSnapshot(
  userId: number,
  role: string
): SalesHomeInsightSnapshot | null {
  if (role !== "sales" && role !== "leader") return null;
  return getDashboardHomeInsight(userId, role);
}

export interface DashboardDayTrendPoint {
  date: string;
  label: string;
  amount: number;
  txnCount: number;
}

export interface DashboardRolling30Comparison {
  recentLabel: string;
  recentRangeLabel: string;
  recentAmount: number;
  recentTxnCount: number;
  recentMerchantCount: number;
  previousLabel: string;
  previousRangeLabel: string;
  previousAmount: number;
  previousTxnCount: number;
  previousMerchantCount: number;
  amountChangePercent: number | null;
  dailyAvgChangePercent: number | null;
}

function formatRangeLabel(startYmd: string, endYmd: string): string {
  const fmt = (ymd: string) => {
    const [, m, d] = ymd.split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  return `${fmt(startYmd)}–${fmt(endYmd)}`;
}

/** 工作台：近 N 日每日交易走势（截至昨日） */
export function getDashboardDailyTrend(
  userId: number,
  role: string,
  dayCount = 30
): DashboardDayTrendPoint[] {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const points: DashboardDayTrendPoint[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(yesterday);
    d.setDate(yesterday.getDate() - i);
    const ymd = formatLocalYmd(d);
    const row = queryDateRange(userId, role, ymd, ymd);
    points.push({
      date: ymd,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      amount: row.totalAmount,
      txnCount: row.txnCount,
    });
  }
  return points;
}

/** 工作台：近 30 日 vs 前 30 日環比 */
export function getDashboardRolling30Comparison(
  userId: number,
  role: string
): DashboardRolling30Comparison {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const recentEnd = formatLocalYmd(yesterday);
  const recentStartDate = new Date(yesterday);
  recentStartDate.setDate(yesterday.getDate() - 29);
  const recentStart = formatLocalYmd(recentStartDate);

  const previousEndDate = new Date(recentStartDate);
  previousEndDate.setDate(recentStartDate.getDate() - 1);
  const previousEnd = formatLocalYmd(previousEndDate);
  const previousStartDate = new Date(previousEndDate);
  previousStartDate.setDate(previousEndDate.getDate() - 29);
  const previousStart = formatLocalYmd(previousStartDate);

  const recent = queryDateRange(userId, role, recentStart, recentEnd);
  const previous = queryDateRange(userId, role, previousStart, previousEnd);
  const windowDays = 30;

  const recentDailyAvg = recent.totalAmount / windowDays;
  const previousDailyAvg = previous.totalAmount / windowDays;

  return {
    recentLabel: "近30日",
    recentRangeLabel: formatRangeLabel(recentStart, recentEnd),
    recentAmount: recent.totalAmount,
    recentTxnCount: recent.txnCount,
    recentMerchantCount: recent.merchantCount,
    previousLabel: "前30日",
    previousRangeLabel: formatRangeLabel(previousStart, previousEnd),
    previousAmount: previous.totalAmount,
    previousTxnCount: previous.txnCount,
    previousMerchantCount: previous.merchantCount,
    amountChangePercent: calcChangePercent(recent.totalAmount, previous.totalAmount),
    dailyAvgChangePercent: calcChangePercent(recentDailyAvg, previousDailyAvg),
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

function monthWhereClause(role: string, userId: number): { fromWhere: string; params: number[] } {
  const access = transactionAccessClause(role, userId);
  return {
    fromWhere: `FROM transactions t JOIN merchants m ON m.id = t.merchant_id WHERE strftime('%Y-%m', t.txn_time) = ? ${access.clause}`,
    params: access.params,
  };
}

function queryDateRange(
  userId: number,
  role: string,
  startInclusive: string,
  endInclusive: string
): { totalAmount: number; txnCount: number; merchantCount: number } {
  const access = transactionAccessClause(role, userId);
  const sql = `SELECT COALESCE(SUM(t.amount), 0) as totalAmount, COUNT(t.id) as txnCount,
         COUNT(DISTINCT m.id) as merchantCount
         FROM transactions t JOIN merchants m ON m.id = t.merchant_id
         WHERE substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ? ${access.clause}`;

  const row = db
    .prepare(sql)
    .get(startInclusive, endInclusive, ...access.params) as {
    totalAmount: number;
    txnCount: number;
    merchantCount: number;
  };

  return {
    totalAmount: Math.round(row.totalAmount * 100) / 100,
    txnCount: row.txnCount,
    merchantCount: row.merchantCount,
  };
}

/** 按日汇总，避免日交叉图逐日查询（原 60 次 → 2 次） */
function queryDailyTotalsMap(
  userId: number,
  role: string,
  startInclusive: string,
  endInclusive: string
): Map<string, { totalAmount: number; txnCount: number }> {
  const access = transactionAccessClause(role, userId);
  const sql = `SELECT substr(t.txn_time, 1, 10) as day,
         COALESCE(SUM(t.amount), 0) as totalAmount,
         COUNT(t.id) as txnCount
         FROM transactions t JOIN merchants m ON m.id = t.merchant_id
         WHERE substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ? ${access.clause}
         GROUP BY day`;
  const rows = db.prepare(sql).all(startInclusive, endInclusive, ...access.params) as Array<{
    day: string;
    totalAmount: number;
    txnCount: number;
  }>;
  const map = new Map<string, { totalAmount: number; txnCount: number }>();
  for (const row of rows) {
    map.set(row.day, {
      totalAmount: Math.round(row.totalAmount * 100) / 100,
      txnCount: row.txnCount,
    });
  }
  return map;
}

export function countMerchantsForUser(userId: number, role: string): number {
  if (role === "admin") {
    return (db.prepare("SELECT COUNT(*) as c FROM merchants").get() as { c: number }).c;
  }
  const access = merchantListAccessClause(role, userId);
  const sql = `SELECT COUNT(*) as c FROM merchants m ${access.where}`;
  return (db.prepare(sql).get(...access.params) as { c: number }).c;
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
  const monthAccess = monthWhereClause(role, userId);
  const sql = `SELECT COALESCE(SUM(t.amount), 0) as totalAmount, COUNT(t.id) as txnCount,
    COUNT(DISTINCT m.id) as merchantCount ${monthAccess.fromWhere}`;
  const row = db
    .prepare(sql)
    .get(ym, ...monthAccess.params) as { totalAmount: number; txnCount: number; merchantCount: number };

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

      const access = transactionAccessClause(role, userId);
      const sql = `SELECT COALESCE(SUM(t.amount), 0) as totalAmount, COUNT(t.id) as txnCount
           FROM transactions t JOIN merchants m ON m.id = t.merchant_id
           WHERE substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) < ? ${access.clause}`;

      const row = db
        .prepare(sql)
        .get(start, effectiveEnd, ...access.params) as { totalAmount: number; txnCount: number };

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
  months: { year: number; month: number }[],
  options?: { includeWeeks?: boolean }
): MonthStat[] {
  const includeWeeks = options?.includeWeeks !== false;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  return months.map(({ year, month }) => {
    const { totalAmount, txnCount, merchantCount } = queryCalendarMonth(userId, role, year, month);
    const weeks = includeWeeks ? getMonthWeekBreakdown(userId, role, year, month) : [];
    const isCurrent = year === currentYear && month === currentMonth;
    const label = monthDisplayLabel(year, month, isCurrent, currentYear);
    const chartLabel = monthChartLabel(year, month, currentYear);

    return { year, month, label, chartLabel, totalAmount, txnCount, merchantCount, isCurrent, weeks };
  });
}

/** 工作台折线图等：无需按周拆分，减少 SQL */
const DASHBOARD_MONTHLY_OPTS = { includeWeeks: false } as const;

/** 工作台：最近三个月（含当月） */
export function getDashboardMonthlyStats(userId: number, role: string): MonthStat[] {
  return getMonthlyStats(userId, role, getRecentCalendarMonths(3));
}

function calendarMonthOffset(monthsBeforeCurrent: number): { year: number; month: number } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBeforeCurrent);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function daysInCalendarMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function sharePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export interface AdminMonthCompareSide {
  label: string;
  chartLabel: string;
  year: number;
  month: number;
  totalAmount: number;
  txnCount: number;
  merchantCount: number;
  days: number;
}

export interface AdminMonthCompare {
  lastMonth: AdminMonthCompareSide;
  previousMonth: AdminMonthCompareSide;
  amountChangePercent: number | null;
  dailyAvgChangePercent: number | null;
}

export interface AdminSalesRankRow {
  rank: number;
  id: number;
  displayName: string;
  lastMonthAmount: number;
  sharePercent: number;
  activeMerchantCount: number;
  assignedMerchantCount: number;
}

export interface AdminMerchantInsightBucket {
  key: "rising" | "declining" | "newSilent" | "flat";
  label: string;
  count: number;
  percent: number;
}

export interface AdminMerchantRankRow {
  rank: number;
  id: number;
  name: string;
  salesName: string | null;
  lastMonthAmount: number;
  sharePercent: number;
}

export interface AdminDailyMonthCrossPoint {
  day: number;
  label: string;
  currentAmount: number | null;
  currentTxnCount: number | null;
  lastAmount: number;
  lastTxnCount: number;
}

export interface AdminDashboardCharts {
  monthlyTrend: MonthStat[];
  monthCompare: AdminMonthCompare;
  salesRanking: {
    rankMonth: string;
    orgLastMonthTotal: number;
    sales: AdminSalesRankRow[];
  };
  merchantInsight: {
    rankMonth: string;
    mtdLabel: string;
    totalAssigned: number;
    buckets: AdminMerchantInsightBucket[];
  };
  merchantBoxOffice: {
    rankMonth: string;
    orgLastMonthTotal: number;
    merchants: AdminMerchantRankRow[];
  };
  dailyMonthCross: {
    currentMonthLabel: string;
    lastMonthLabel: string;
    points: AdminDailyMonthCrossPoint[];
  };
}

export function getAdminMonthCompare(userId: number, role: string): AdminMonthCompare {
  const previousRef = calendarMonthOffset(2);
  const lastRef = calendarMonthOffset(1);
  const stats = getMonthlyStats(userId, role, [previousRef, lastRef], DASHBOARD_MONTHLY_OPTS);
  const [previousMonthStat, lastMonthStat] = stats;

  const previousDays = daysInCalendarMonth(previousRef.year, previousRef.month);
  const lastDays = daysInCalendarMonth(lastRef.year, lastRef.month);

  const amountChangePercent = calcChangePercent(
    lastMonthStat.totalAmount,
    previousMonthStat.totalAmount
  );
  const dailyAvgChangePercent = calcChangePercent(
    lastMonthStat.totalAmount / lastDays,
    previousMonthStat.totalAmount / previousDays
  );

  const toSide = (
    stat: MonthStat,
    ref: { year: number; month: number },
    days: number
  ): AdminMonthCompareSide => ({
    label: stat.label,
    chartLabel: stat.chartLabel,
    year: ref.year,
    month: ref.month,
    totalAmount: stat.totalAmount,
    txnCount: stat.txnCount,
    merchantCount: stat.merchantCount,
    days,
  });

  return {
    lastMonth: toSide(lastMonthStat, lastRef, lastDays),
    previousMonth: toSide(previousMonthStat, previousRef, previousDays),
    amountChangePercent,
    dailyAvgChangePercent,
  };
}

export function getAdminSalesRanking(orgLastMonthTotal: number): AdminSalesRankRow[] {
  return listTigerTeamSales()
    .slice()
    .sort((a, b) => b.lastMonthAmount - a.lastMonthAmount || a.displayName.localeCompare(b.displayName, "zh-HK"))
    .map((row, index) => ({
      rank: index + 1,
      id: row.id,
      displayName: row.displayName,
      lastMonthAmount: row.lastMonthAmount,
      sharePercent: sharePercent(row.lastMonthAmount, orgLastMonthTotal),
      activeMerchantCount: row.activeMerchantCount,
      assignedMerchantCount: row.assignedMerchantCount,
    }));
}

export function getLeaderTeamSalesRanking(
  leaderId: number,
  teamLastMonthTotal: number
): AdminSalesRankRow[] {
  return listLeaderTeamSales(leaderId)
    .slice()
    .sort((a, b) => b.lastMonthAmount - a.lastMonthAmount || a.displayName.localeCompare(b.displayName, "zh-HK"))
    .map((row, index) => ({
      rank: index + 1,
      id: row.id,
      displayName: row.displayName,
      lastMonthAmount: row.lastMonthAmount,
      sharePercent: sharePercent(row.lastMonthAmount, teamLastMonthTotal),
      activeMerchantCount: row.activeMerchantCount,
      assignedMerchantCount: row.assignedMerchantCount,
    }));
}

const INSIGHT_BUCKET_META: Array<{
  key: AdminMerchantInsightBucket["key"];
  label: string;
}> = [
  { key: "rising", label: "上漲" },
  { key: "declining", label: "下跌中" },
  { key: "newSilent", label: "新沉默" },
  { key: "flat", label: "平穩" },
];

function merchantInsightFromList(merchants: MerchantSummary[]): AdminDashboardCharts["merchantInsight"] {
  const totalAssigned = merchants.length;
  const counts = new Map<AdminMerchantInsightBucket["key"], number>(
    INSIGHT_BUCKET_META.map((b) => [b.key, 0])
  );

  for (const m of merchants) {
    if (m.status === "inactive") continue;
    if (counts.has(m.status as AdminMerchantInsightBucket["key"])) {
      counts.set(
        m.status as AdminMerchantInsightBucket["key"],
        (counts.get(m.status as AdminMerchantInsightBucket["key"]) ?? 0) + 1
      );
    }
  }

  return {
    rankMonth: getMerchantRankMonthLabel(),
    mtdLabel: getMtdThroughYesterdayLabel(),
    totalAssigned,
    buckets: INSIGHT_BUCKET_META.map((meta) => {
      const count = counts.get(meta.key) ?? 0;
      return {
        key: meta.key,
        label: meta.label,
        count,
        percent: sharePercent(count, totalAssigned),
      };
    }),
  };
}

function merchantBoxOfficeFromList(
  merchants: MerchantSummary[],
  limit = 20
): AdminDashboardCharts["merchantBoxOffice"] {
  const orgLastMonthTotal = merchants.reduce((sum, m) => sum + m.lastMonthAmount, 0);
  const top = merchants
    .slice()
    .sort((a, b) => b.lastMonthAmount - a.lastMonthAmount || a.name.localeCompare(b.name, "zh-HK"))
    .slice(0, limit)
    .map((m, index) => ({
      rank: index + 1,
      id: m.id,
      name: m.name,
      salesName: m.salesName,
      lastMonthAmount: m.lastMonthAmount,
      sharePercent: sharePercent(m.lastMonthAmount, orgLastMonthTotal),
    }));

  return {
    rankMonth: getMerchantRankMonthLabel(),
    orgLastMonthTotal: Math.round(orgLastMonthTotal * 100) / 100,
    merchants: top,
  };
}

export function getAdminMerchantInsightDistribution(
  userId: number,
  role: string
): AdminDashboardCharts["merchantInsight"] {
  return merchantInsightFromList(listMerchantsForUser(userId, role));
}

export function getAdminMerchantBoxOffice(
  userId: number,
  role: string,
  limit = 20
): AdminDashboardCharts["merchantBoxOffice"] {
  return merchantBoxOfficeFromList(listMerchantsForUser(userId, role), limit);
}

export function getAdminDailyMonthCross(
  userId: number,
  role: string
): AdminDashboardCharts["dailyMonthCross"] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const lastRef = calendarMonthOffset(1);
  const mtd = getMtdThroughYesterdayRange();
  const currentThroughDay = mtd.days;
  const currentMonthDays = daysInCalendarMonth(currentYear, currentMonth);
  const lastMonthDays = daysInCalendarMonth(lastRef.year, lastRef.month);

  const currentStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
  const currentEnd =
    currentThroughDay > 0
      ? `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(Math.min(currentThroughDay, currentMonthDays)).padStart(2, "0")}`
      : currentStart;
  const lastStart = `${lastRef.year}-${String(lastRef.month).padStart(2, "0")}-01`;
  const lastEnd = `${lastRef.year}-${String(lastRef.month).padStart(2, "0")}-${String(lastMonthDays).padStart(2, "0")}`;

  const currentByDay =
    currentThroughDay > 0 ? queryDailyTotalsMap(userId, role, currentStart, currentEnd) : new Map();
  const lastByDay = queryDailyTotalsMap(userId, role, lastStart, lastEnd);

  const points: AdminDailyMonthCrossPoint[] = [];
  for (let day = 1; day <= 30; day++) {
    let currentAmount: number | null = null;
    let currentTxnCount: number | null = null;
    if (day <= currentThroughDay && day <= currentMonthDays) {
      const ymd = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const row = currentByDay.get(ymd);
      currentAmount = row?.totalAmount ?? 0;
      currentTxnCount = row?.txnCount ?? 0;
    }

    let lastAmount = 0;
    let lastTxnCount = 0;
    if (day <= lastMonthDays) {
      const ymd = `${lastRef.year}-${String(lastRef.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const row = lastByDay.get(ymd);
      lastAmount = row?.totalAmount ?? 0;
      lastTxnCount = row?.txnCount ?? 0;
    }

    points.push({
      day,
      label: `${day}日`,
      currentAmount,
      currentTxnCount,
      lastAmount,
      lastTxnCount,
    });
  }

  return {
    currentMonthLabel: `${currentMonth}月`,
    lastMonthLabel: `${lastRef.month}月`,
    points,
  };
}

export function getAdminDashboardCharts(userId: number, role: string): AdminDashboardCharts | null {
  if (role !== "admin") return null;

  const merchants = listMerchantsForUser(userId, role);
  const merchantBoxOffice = merchantBoxOfficeFromList(merchants, 20);

  return {
    monthlyTrend: getMonthlyStats(userId, role, getRecentCalendarMonths(6), DASHBOARD_MONTHLY_OPTS),
    monthCompare: getAdminMonthCompare(userId, role),
    salesRanking: {
      rankMonth: merchantBoxOffice.rankMonth,
      orgLastMonthTotal: merchantBoxOffice.orgLastMonthTotal,
      sales: getAdminSalesRanking(merchantBoxOffice.orgLastMonthTotal),
    },
    merchantInsight: merchantInsightFromList(merchants),
    merchantBoxOffice,
    dailyMonthCross: getAdminDailyMonthCross(userId, role),
  };
}

export function getPersonalDashboardCharts(
  userId: number
): Pick<AdminDashboardCharts, "monthlyTrend" | "monthCompare" | "merchantInsight" | "dailyMonthCross"> {
  const role = "sales";
  const merchants = listMerchantsForUser(userId, role);
  return {
    monthlyTrend: getMonthlyStats(userId, role, getRecentCalendarMonths(3), DASHBOARD_MONTHLY_OPTS),
    monthCompare: getAdminMonthCompare(userId, role),
    merchantInsight: merchantInsightFromList(merchants),
    dailyMonthCross: getAdminDailyMonthCross(userId, role),
  };
}

export function getLeaderDashboardCharts(userId: number): AdminDashboardCharts {
  const role = "leader";
  const merchants = listMerchantsForUser(userId, role);
  const merchantBoxOffice = merchantBoxOfficeFromList(merchants, 20);

  return {
    monthlyTrend: getMonthlyStats(userId, role, getRecentCalendarMonths(3), DASHBOARD_MONTHLY_OPTS),
    monthCompare: getAdminMonthCompare(userId, role),
    salesRanking: {
      rankMonth: merchantBoxOffice.rankMonth,
      orgLastMonthTotal: merchantBoxOffice.orgLastMonthTotal,
      sales: getLeaderTeamSalesRanking(userId, merchantBoxOffice.orgLastMonthTotal),
    },
    merchantInsight: merchantInsightFromList(merchants),
    merchantBoxOffice,
    dailyMonthCross: getAdminDailyMonthCross(userId, role),
  };
}
