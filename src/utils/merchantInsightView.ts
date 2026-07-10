import type {
  MerchantInsightRow,
  MerchantInsightStatus,
  MerchantListSortKey,
  MerchantSummary,
  SalesHomeInsightSnapshot,
} from "@/api/client";

type InsightMerchant = Pick<
  MerchantSummary,
  "lastMonthAmount" | "mtdAmount" | "dailyAvgChangePercent" | "status" | "hasUnreadAlert" | "name"
>;

const DEFAULT_DECLINE_THRESHOLD = 10;

export function inferMerchantStatus(
  lastMonthAmount: number,
  mtdAmount: number,
  dailyAvgChangePercent: number | null,
  threshold = DEFAULT_DECLINE_THRESHOLD
): MerchantInsightStatus {
  if (lastMonthAmount > 0 && mtdAmount === 0) return "newSilent";
  if (mtdAmount === 0) return "inactive";
  if (dailyAvgChangePercent !== null && dailyAvgChangePercent < -threshold) return "declining";
  if (dailyAvgChangePercent !== null && dailyAvgChangePercent > 0) return "rising";
  return "flat";
}

export function sortMerchantsForView<T extends InsightMerchant>(
  rows: T[],
  sortKey: MerchantListSortKey
): T[] {
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

export function normalizeMerchantInsightRow(row: MerchantInsightRow): MerchantInsightRow {
  const status =
    row.status != null
      ? row.status
      : inferMerchantStatus(row.lastMonthAmount, row.mtdAmount, row.dailyAvgChangePercent);
  return {
    ...row,
    unreadAlertPeriods: row.unreadAlertPeriods ?? [],
    status,
    hasUnreadAlert: row.hasUnreadAlert ?? false,
  };
}

export function normalizeMerchantSummary(row: MerchantSummary): MerchantSummary {
  const status =
    row.status != null
      ? row.status
      : inferMerchantStatus(row.lastMonthAmount, row.mtdAmount, row.dailyAvgChangePercent);
  return {
    ...row,
    unreadAlertPeriods: row.unreadAlertPeriods ?? [],
    status,
    hasUnreadAlert: row.hasUnreadAlert ?? false,
  };
}

function mtdDaysThroughYesterday(): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  if (yesterday < monthStart) return 0;
  return yesterday.getDate();
}

function daysInPreviousCalendarMonth(): number {
  const d = new Date();
  d.setDate(0);
  return d.getDate();
}

/** 旧版 overview 无 homeInsight 时，由商户列表在前端拼装摘要 */
export function buildHomeInsightFromMerchants(
  merchants: MerchantSummary[],
  mtdLabel: string
): SalesHomeInsightSnapshot {
  const mtdAmount = Math.round(merchants.reduce((sum, m) => sum + m.mtdAmount, 0) * 100) / 100;
  const lastMonthAmount = merchants.reduce((sum, m) => sum + m.lastMonthAmount, 0);
  const mtdDays = mtdDaysThroughYesterday();
  const lastMonthDays = daysInPreviousCalendarMonth();

  let dailyAvgChangePercent: number | null = null;
  if (mtdDays > 0 && lastMonthDays > 0 && lastMonthAmount > 0) {
    const currentDailyAvg = mtdAmount / mtdDays;
    const lastMonthDailyAvg = lastMonthAmount / lastMonthDays;
    dailyAvgChangePercent =
      Math.round(((currentDailyAvg - lastMonthDailyAvg) / lastMonthDailyAvg) * 1000) / 10;
  }

  return {
    mtdLabel,
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
