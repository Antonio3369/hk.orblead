import { db } from "./db.js";
import { getSalesInsightCounts } from "./merchantInsights.js";

interface MonthRef {
  ym: string;
  label: string;
  days: number;
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRef(monthsBeforeCurrent: number): MonthRef {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBeforeCurrent);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { ym, label: `${d.getMonth() + 1}月`, days };
}

function getMtdThroughYesterday(): { start: string; end: string; days: number; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const month = today.getMonth() + 1;

  if (yesterday < monthStart) {
    return {
      start: formatLocalYmd(monthStart),
      end: formatLocalYmd(monthStart),
      days: 0,
      label: `${month}月（今日為月初，暫無本月數據）`,
    };
  }

  const endDay = yesterday.getDate();
  const label = endDay <= 1 ? `${month}月1日` : `${month}月1日–${endDay}日`;
  return {
    start: formatLocalYmd(monthStart),
    end: formatLocalYmd(yesterday),
    days: endDay,
    label,
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current > 0) return 100;
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function dailyAvgPct(
  amount: number,
  days: number,
  prevAmount: number,
  prevDays: number
): number | null {
  if (days <= 0 || prevDays <= 0) return null;
  const curAvg = amount / days;
  const prevAvg = prevAmount / prevDays;
  return pctChange(curAvg, prevAvg);
}

function countAssignedMerchants(salesUserId: number): number {
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM merchants WHERE sales_user_id = ?`)
    .get(salesUserId) as { c: number };
  return row.c;
}

function sumByCalendarMonth(salesUserId: number, ym: string): { amount: number; activeMerchants: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(t.amount), 0) as amount,
        COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN m.id END) as activeMerchants
       FROM merchants m
       LEFT JOIN transactions t ON t.merchant_id = m.id AND strftime('%Y-%m', t.txn_time) = ?
       WHERE m.sales_user_id = ?`
    )
    .get(ym, salesUserId) as { amount: number; activeMerchants: number };
  return {
    amount: Math.round(row.amount * 100) / 100,
    activeMerchants: row.activeMerchants,
  };
}

function sumByDateRange(
  salesUserId: number,
  start: string,
  end: string
): { amount: number; activeMerchants: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(t.amount), 0) as amount,
        COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN m.id END) as activeMerchants
       FROM merchants m
       LEFT JOIN transactions t ON t.merchant_id = m.id
         AND substr(t.txn_time, 1, 10) >= ? AND substr(t.txn_time, 1, 10) <= ?
       WHERE m.sales_user_id = ?`
    )
    .get(start, end, salesUserId) as { amount: number; activeMerchants: number };
  return {
    amount: Math.round(row.amount * 100) / 100,
    activeMerchants: row.activeMerchants,
  };
}

function sameDayRangeInMonth(ym: string, throughDay: number): { start: string; end: string; days: number } {
  const [y, m] = ym.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const endDay = Math.min(throughDay, daysInMonth);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${y}-${pad(m)}-01`,
    end: `${y}-${pad(m)}-${pad(endDay)}`,
    days: endDay,
  };
}

export interface SalesPeriodColumn {
  key: "twoMonthsAgo" | "lastMonth" | "currentMtd";
  title: string;
  rangeLabel: string;
  totalAmount: number;
  assignedMerchantCount: number;
  activeMerchantCount: number;
  amountChangePercent: number | null;
  dailyAvgChangePercent: number | null;
}

export interface TigerTeamSalesRow {
  id: number;
  displayName: string;
  username: string;
  role: "sales" | "leader";
  leaderDisplayName: string | null;
  assignedMerchantCount: number;
  activeMerchantCount: number;
  lastMonthAmount: number;
  lastMonthLabel: string;
  mtdAmount: number;
  mtdLabel: string;
  mtdDailyAvgChangePercent: number | null;
  newSilentCount: number;
  decliningCount: number;
  risingCount: number;
  unreadAlerts: number;
  totalAlerts: number;
}

function alertCountsForSales(salesUserId: number): { unread: number; total: number } {
  const row = db
    .prepare(
      `SELECT
        SUM(CASE WHEN a.acknowledged = 0 THEN 1 ELSE 0 END) as unread,
        COUNT(*) as total
       FROM alerts a
       JOIN merchants m ON m.id = a.merchant_id
       WHERE m.sales_user_id = ? AND a.period IN ('week', 'month')`
    )
    .get(salesUserId) as { unread: number | null; total: number };
  return { unread: row.unread ?? 0, total: row.total ?? 0 };
}

/** 管理員飛虎隊：含銷售與主管帳號；團隊內銷售仍全部列出 */

export function listTigerTeamSales(salesUserIds?: number[]): TigerTeamSalesRow[] {
  const lastMonth = monthRef(1);
  const mtd = getMtdThroughYesterday();

  let users: {
    id: number;
    username: string;
    displayName: string;
    role: "sales" | "leader";
    leaderDisplayName: string | null;
  }[];
  if (salesUserIds && salesUserIds.length > 0) {
    const placeholders = salesUserIds.map(() => "?").join(",");
    users = db
      .prepare(
        `SELECT u.id, u.username, u.display_name as displayName, u.role,
          lg.display_name as leaderDisplayName
         FROM users u
         LEFT JOIN leader_team_members m ON m.sales_user_id = u.id
         LEFT JOIN users lg ON lg.id = m.leader_user_id
         WHERE u.id IN (${placeholders}) AND u.role = 'sales' AND COALESCE(u.enabled, 1) = 1
         ORDER BY u.display_name`
      )
      .all(...salesUserIds) as typeof users;
  } else {
    users = db
      .prepare(
        `SELECT u.id, u.username, u.display_name as displayName, u.role,
          lg.display_name as leaderDisplayName
         FROM users u
         LEFT JOIN leader_team_members m ON m.sales_user_id = u.id
         LEFT JOIN users lg ON lg.id = m.leader_user_id
         WHERE u.role IN ('sales', 'leader') AND COALESCE(u.enabled, 1) = 1
         ORDER BY u.role DESC, u.display_name`
      )
      .all() as typeof users;
  }

  const rows = users.map((u) => {
    const assigned = countAssignedMerchants(u.id);
    const last = sumByCalendarMonth(u.id, lastMonth.ym);
    const cur = sumByDateRange(u.id, mtd.start, mtd.end);
    const alerts = alertCountsForSales(u.id);
    const insights = getSalesInsightCounts(u.id);
    const periods = getSalesPeriodComparison(u.id);
    const mtdPeriod = periods.find((p) => p.key === "currentMtd");
    return {
      id: u.id,
      displayName: u.displayName,
      username: u.username,
      role: u.role,
      leaderDisplayName: u.leaderDisplayName,
      assignedMerchantCount: assigned,
      activeMerchantCount: insights.activeMerchantCount,
      lastMonthAmount: last.amount,
      lastMonthLabel: lastMonth.label,
      mtdAmount: cur.amount,
      mtdLabel: mtd.label,
      mtdDailyAvgChangePercent: mtdPeriod?.dailyAvgChangePercent ?? null,
      newSilentCount: insights.newSilentCount,
      decliningCount: insights.decliningCount,
      risingCount: insights.risingCount,
      unreadAlerts: alerts.unread,
      totalAlerts: alerts.total,
    };
  });

  return rows;
}

export function getSalesPeriodComparison(salesUserId: number): SalesPeriodColumn[] {
  const assigned = countAssignedMerchants(salesUserId);
  const twoMonthsAgo = monthRef(2);
  const lastMonth = monthRef(1);
  const mtd = getMtdThroughYesterday();

  const p2 = sumByCalendarMonth(salesUserId, twoMonthsAgo.ym);
  const p1 = sumByCalendarMonth(salesUserId, lastMonth.ym);
  const p0 = sumByDateRange(salesUserId, mtd.start, mtd.end);

  const partialRange = mtd.days > 0 ? sameDayRangeInMonth(lastMonth.ym, mtd.days) : null;
  const lastMonthPartial = partialRange
    ? sumByDateRange(salesUserId, partialRange.start, partialRange.end)
    : { amount: 0, activeMerchants: 0 };

  return [
    {
      key: "twoMonthsAgo",
      title: "上上月",
      rangeLabel: twoMonthsAgo.label,
      totalAmount: p2.amount,
      assignedMerchantCount: assigned,
      activeMerchantCount: p2.activeMerchants,
      amountChangePercent: null,
      dailyAvgChangePercent: null,
    },
    {
      key: "lastMonth",
      title: "上月",
      rangeLabel: lastMonth.label,
      totalAmount: p1.amount,
      assignedMerchantCount: assigned,
      activeMerchantCount: p1.activeMerchants,
      amountChangePercent: pctChange(p1.amount, p2.amount),
      dailyAvgChangePercent: dailyAvgPct(p1.amount, lastMonth.days, p2.amount, twoMonthsAgo.days),
    },
    {
      key: "currentMtd",
      title: "本月",
      rangeLabel: mtd.label,
      totalAmount: p0.amount,
      assignedMerchantCount: assigned,
      activeMerchantCount: p0.activeMerchants,
      amountChangePercent:
        mtd.days > 0 ? pctChange(p0.amount, lastMonthPartial.amount) : null,
      dailyAvgChangePercent:
        mtd.days > 0
          ? dailyAvgPct(p0.amount, mtd.days, p1.amount, lastMonth.days)
          : null,
    },
  ];
}

export function getTigerTeamSalesUser(salesUserId: number) {
  return db
    .prepare(
      `SELECT id, username, display_name as displayName, role
       FROM users WHERE id = ? AND role IN ('sales', 'leader') AND COALESCE(enabled, 1) = 1`
    )
    .get(salesUserId) as
    | { id: number; username: string; displayName: string; role: "sales" | "leader" }
    | undefined;
}

export { getAlertsForSalesUser } from "./alertsEngine.js";

export function getTigerTeamDashboardSummary(salesUserIds?: number[]): {
  salesCount: number;
  unreadAlerts: number;
  salesWithUnread: number;
} {
  if (salesUserIds && salesUserIds.length === 0) {
    return { salesCount: 0, unreadAlerts: 0, salesWithUnread: 0 };
  }

  const salesCount =
    salesUserIds && salesUserIds.length > 0
      ? salesUserIds.length
      : (db
          .prepare(
            `SELECT COUNT(*) as c FROM users
             WHERE role IN ('sales', 'leader') AND COALESCE(enabled, 1) = 1`
          )
          .get() as { c: number }).c;

  const alertRow =
    salesUserIds && salesUserIds.length > 0
      ? (db
          .prepare(
            `SELECT
              SUM(CASE WHEN a.acknowledged = 0 THEN 1 ELSE 0 END) as unread,
              COUNT(DISTINCT CASE WHEN a.acknowledged = 0 THEN m.sales_user_id END) as salesWithUnread
             FROM alerts a
             JOIN merchants m ON m.id = a.merchant_id
             WHERE m.sales_user_id IN (${salesUserIds.map(() => "?").join(",")})
               AND a.period IN ('week', 'month')`
          )
          .get(...salesUserIds) as { unread: number | null; salesWithUnread: number | null })
      : (db
          .prepare(
            `SELECT
              SUM(CASE WHEN a.acknowledged = 0 THEN 1 ELSE 0 END) as unread,
              COUNT(DISTINCT CASE WHEN a.acknowledged = 0 THEN m.sales_user_id END) as salesWithUnread
             FROM alerts a
             JOIN merchants m ON m.id = a.merchant_id
             JOIN users u ON u.id = m.sales_user_id
               AND u.role IN ('sales', 'leader') AND COALESCE(u.enabled, 1) = 1
             WHERE a.period IN ('week', 'month')`
          )
          .get() as { unread: number | null; salesWithUnread: number | null });

  return {
    salesCount,
    unreadAlerts: alertRow.unread ?? 0,
    salesWithUnread: alertRow.salesWithUnread ?? 0,
  };
}
