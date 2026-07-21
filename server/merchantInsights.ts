import { db } from "./db.js";
import { calcDailyAvgChangePercent } from "./analytics.js";
import { getDailyDeclineThreshold } from "./insightRules.js";

export type MerchantInsightStatus = "newSilent" | "declining" | "rising" | "flat" | "inactive";

export interface MerchantInsightRow {
  id: number;
  name: string;
  merchantCode: string | null;
  lastMonthAmount: number;
  mtdAmount: number;
  dailyAvgChangePercent: number | null;
  status: MerchantInsightStatus;
  lastTxnDate: string | null;
  hasUnreadAlert: boolean;
  unreadAlertPeriods: Array<"week" | "month">;
}

export interface SalesInsightCounts {
  assignedMerchantCount: number;
  activeMerchantCount: number;
  newSilentCount: number;
  decliningCount: number;
  risingCount: number;
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMtdThroughYesterday(): { start: string; end: string; days: number } {
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

function previousCalendarMonthYm(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInPreviousCalendarMonth(): number {
  const d = new Date();
  d.setDate(0);
  return d.getDate();
}

function classifyMerchant(
  lastMonthAmount: number,
  mtdAmount: number,
  dailyAvgChangePercent: number | null,
  threshold: number
): MerchantInsightStatus {
  if (lastMonthAmount > 0 && mtdAmount === 0) return "newSilent";
  if (mtdAmount === 0) return "inactive";
  if (dailyAvgChangePercent !== null && dailyAvgChangePercent < -threshold) return "declining";
  if (dailyAvgChangePercent !== null && dailyAvgChangePercent > 0) return "rising";
  return "flat";
}

export function getMerchantInsightStatus(
  lastMonthAmount: number,
  mtdAmount: number,
  dailyAvgChangePercent: number | null
): MerchantInsightStatus {
  return classifyMerchant(
    lastMonthAmount,
    mtdAmount,
    dailyAvgChangePercent,
    getDailyDeclineThreshold()
  );
}

const STATUS_PRIORITY: Record<MerchantInsightStatus, number> = {
  newSilent: 0,
  declining: 1,
  flat: 2,
  rising: 3,
  inactive: 4,
};

export function sortMerchantsByAttention(rows: MerchantInsightRow[]): MerchantInsightRow[] {
  return [...rows].sort((a, b) => {
    const alertA = a.hasUnreadAlert ? 0 : 1;
    const alertB = b.hasUnreadAlert ? 0 : 1;
    if (alertA !== alertB) return alertA - alertB;

    const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusDiff !== 0) return statusDiff;

    if (a.status === "declining" && b.status === "declining") {
      const av = a.dailyAvgChangePercent ?? 0;
      const bv = b.dailyAvgChangePercent ?? 0;
      if (av !== bv) return av - bv;
    }

    if (a.status === "newSilent" && b.status === "newSilent") {
      if (b.lastMonthAmount !== a.lastMonthAmount) return b.lastMonthAmount - a.lastMonthAmount;
    }

    if (b.mtdAmount !== a.mtdAmount) return b.mtdAmount - a.mtdAmount;
    return a.name.localeCompare(b.name, "zh-HK");
  });
}

export function parseUnreadAlertPeriods(raw: string | null | undefined): Array<"week" | "month"> {
  if (!raw) return [];
  const periods: Array<"week" | "month"> = [];
  for (const part of raw.split(",")) {
    if (part === "week" || part === "month") periods.push(part);
  }
  return periods;
}

export function listMerchantInsightsForSales(salesUserId: number): MerchantInsightRow[] {
  const ym = previousCalendarMonthYm();
  const mtd = getMtdThroughYesterday();
  const lastMonthDays = daysInPreviousCalendarMonth();
  const threshold = getDailyDeclineThreshold();

  const sql = `
    SELECT m.id, m.name, m.merchant_code as merchantCode,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.txn_time) = ? THEN t.amount ELSE 0 END), 0) as lastMonthAmount,
      COALESCE(SUM(CASE WHEN substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ? THEN t.amount ELSE 0 END), 0) as mtdAmount,
      (SELECT MAX(substr(txn_time, 1, 10)) FROM transactions WHERE merchant_id = m.id) as lastTxnDate,
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
    WHERE m.sales_user_id = ?
    GROUP BY m.id
  `;

  const rows = db.prepare(sql).all(ym, mtd.start, mtd.end, salesUserId) as Array<{
    id: number;
    name: string;
    merchantCode: string | null;
    lastMonthAmount: number;
    mtdAmount: number;
    lastTxnDate: string | null;
    hasUnreadAlert: number;
    unreadAlertPeriodsRaw: string | null;
  }>;

  const insights = rows.map((r) => {
    const lastMonthAmount = Math.round(r.lastMonthAmount * 100) / 100;
    const mtdAmount = Math.round(r.mtdAmount * 100) / 100;
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
      lastMonthAmount,
      mtdAmount,
      dailyAvgChangePercent,
      status: classifyMerchant(lastMonthAmount, mtdAmount, dailyAvgChangePercent, threshold),
      lastTxnDate: r.lastTxnDate,
      hasUnreadAlert: r.hasUnreadAlert === 1,
      unreadAlertPeriods: parseUnreadAlertPeriods(r.unreadAlertPeriodsRaw),
    };
  });

  return sortMerchantsForView(insights, "lastMonthAmount");
}

export type MerchantListSortKey =
  | "lastMonthAmount"
  | "newSilent"
  | "declining"
  | "rising"
  | "unreadAlerts";

export function sortMerchantsForView(
  rows: MerchantInsightRow[],
  sortKey: MerchantListSortKey
): MerchantInsightRow[] {
  const sorted = [...rows];
  switch (sortKey) {
    case "newSilent":
      return sorted
        .filter((m) => m.status === "newSilent")
        .sort((a, b) => b.lastMonthAmount - a.lastMonthAmount || a.name.localeCompare(b.name, "zh-HK"));
    case "declining":
      return sorted
        .filter((m) => m.status === "declining")
        .sort(
          (a, b) =>
            (a.dailyAvgChangePercent ?? 0) - (b.dailyAvgChangePercent ?? 0) ||
            b.lastMonthAmount - a.lastMonthAmount
        );
    case "rising":
      return sorted
        .filter((m) => m.status === "rising")
        .sort(
          (a, b) =>
            (b.dailyAvgChangePercent ?? 0) - (a.dailyAvgChangePercent ?? 0) ||
            b.mtdAmount - a.mtdAmount
        );
    case "unreadAlerts":
      return sorted
        .filter((m) => m.hasUnreadAlert)
        .sort((a, b) => b.lastMonthAmount - a.lastMonthAmount || a.name.localeCompare(b.name, "zh-HK"));
    case "lastMonthAmount":
    default:
      return sorted.sort(
        (a, b) => b.lastMonthAmount - a.lastMonthAmount || a.name.localeCompare(b.name, "zh-HK")
      );
  }
}

export function getSalesInsightCounts(salesUserId: number): SalesInsightCounts {
  return summarizeMerchantInsights(listMerchantInsightsForSales(salesUserId));
}

export function summarizeMerchantInsights(merchants: MerchantInsightRow[]): SalesInsightCounts {
  return {
    assignedMerchantCount: merchants.length,
    activeMerchantCount: merchants.filter((m) => m.mtdAmount > 0).length,
    newSilentCount: merchants.filter((m) => m.status === "newSilent").length,
    decliningCount: merchants.filter((m) => m.status === "declining").length,
    risingCount: merchants.filter((m) => m.status === "rising").length,
  };
}

export type SalesListSortKey =
  | "lastMonthAmount"
  | "newSilent"
  | "declining"
  | "rising"
  | "unreadAlerts";

export function sortTigerTeamRows<
  T extends {
    displayName: string;
    lastMonthAmount: number;
    mtdAmount: number;
    mtdDailyAvgChangePercent: number | null;
    newSilentCount: number;
    decliningCount: number;
    risingCount: number;
    unreadAlerts: number;
  },
>(rows: T[], sortKey: SalesListSortKey): T[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "newSilent":
        return (
          b.newSilentCount - a.newSilentCount ||
          a.displayName.localeCompare(b.displayName, "zh-HK")
        );
      case "declining":
        return (
          b.decliningCount - a.decliningCount ||
          a.displayName.localeCompare(b.displayName, "zh-HK")
        );
      case "rising":
        return (
          b.risingCount - a.risingCount ||
          a.displayName.localeCompare(b.displayName, "zh-HK")
        );
      case "unreadAlerts":
        return (
          b.unreadAlerts - a.unreadAlerts ||
          a.displayName.localeCompare(b.displayName, "zh-HK")
        );
      case "lastMonthAmount":
      default:
        return (
          b.lastMonthAmount - a.lastMonthAmount ||
          a.displayName.localeCompare(b.displayName, "zh-HK")
        );
    }
  });
  return sorted;
}
