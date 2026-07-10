import { db } from "./db.js";
import type { PeriodType } from "./analytics.js";
import { ADMIN_READ_EXISTS, LEADER_REPLY_EXISTS } from "./alertsEngine.js";

const STALE_DAYS = 5;

const HAS_SALES_LEADER = `(
  m.sales_user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM leader_team_members ltm WHERE ltm.sales_user_id = m.sales_user_id
  )
)`;

/** 銷售已跟進，有主管但主管尚未回覆 */
const LEADER_PENDING_REPLY = `(
  a.acknowledged = 1
  AND ${HAS_SALES_LEADER}
  AND NOT (${LEADER_REPLY_EXISTS})
)`;

/** 銷售已跟進，主管已回覆（或無主管），管理員尚未閱 */
const PENDING_ADMIN_READ = `(
  a.acknowledged = 1
  AND NOT (${ADMIN_READ_EXISTS})
  AND (
    NOT ${HAS_SALES_LEADER}
    OR (${LEADER_REPLY_EXISTS})
  )
)`;

function periodClause(period?: PeriodType): { sql: string; args: string[] } {
  if (period === "week" || period === "month") {
    return { sql: "AND a.period = ?", args: [period] };
  }
  return { sql: "AND a.period IN ('week', 'month')", args: [] };
}

export interface AlertOversightSummary {
  total: number;
  unfollowed: number;
  pendingAdminRead: number;
  leaderPendingReply: number;
  stale: number;
}

export function getAlertOversightSummary(period?: PeriodType): AlertOversightSummary {
  const { sql: periodSql, args } = periodClause(period);
  const row = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN a.acknowledged = 0 THEN 1 ELSE 0 END), 0) as unfollowed,
        COALESCE(SUM(CASE WHEN ${LEADER_PENDING_REPLY} THEN 1 ELSE 0 END), 0) as leaderPendingReply,
        COALESCE(SUM(CASE WHEN ${PENDING_ADMIN_READ} THEN 1 ELSE 0 END), 0) as pendingAdminRead,
        COALESCE(SUM(CASE WHEN a.acknowledged = 0 AND a.computed_at <= datetime('now', '-${STALE_DAYS} days') THEN 1 ELSE 0 END), 0) as stale
       FROM alerts a
       JOIN merchants m ON m.id = a.merchant_id
       WHERE 1=1 ${periodSql}`
    )
    .get(...args) as {
    total: number;
    unfollowed: number;
    pendingAdminRead: number;
    leaderPendingReply: number;
    stale: number;
  };

  return {
    total: row.total,
    unfollowed: row.unfollowed,
    pendingAdminRead: row.pendingAdminRead,
    leaderPendingReply: row.leaderPendingReply,
    stale: row.stale,
  };
}

export interface SalesAccountabilityRow {
  salesUserId: number | null;
  salesName: string;
  unfollowed: number;
  maxStaleDays: number;
  followed: number;
  followedThisWeek: number;
  total: number;
}

export function getSalesAccountability(period?: PeriodType): SalesAccountabilityRow[] {
  const { sql: periodSql, args } = periodClause(period);
  return db
    .prepare(
      `SELECT
        m.sales_user_id as salesUserId,
        COALESCE(NULLIF(TRIM(m.sales_name), ''), u.display_name, '待分配') as salesName,
        COALESCE(SUM(CASE WHEN a.acknowledged = 0 THEN 1 ELSE 0 END), 0) as unfollowed,
        COALESCE(MAX(CASE WHEN a.acknowledged = 0
          THEN CAST(julianday('now', 'localtime') - julianday(a.computed_at) AS INTEGER)
          ELSE 0 END), 0) as maxStaleDays,
        COALESCE(SUM(CASE WHEN a.acknowledged = 1 THEN 1 ELSE 0 END), 0) as followed,
        COALESCE((
          SELECT COUNT(*) FROM follow_ups fw
          WHERE fw.type = 'alert'
            AND fw.created_at >= datetime('now', '-7 days', 'localtime')
            AND (
              (m.sales_user_id IS NOT NULL AND fw.sales_user_id = m.sales_user_id)
              OR (
                m.sales_user_id IS NULL
                AND fw.merchant_id IN (SELECT id FROM merchants WHERE sales_user_id IS NULL)
              )
            )
        ), 0) as followedThisWeek,
        COUNT(*) as total
       FROM alerts a
       JOIN merchants m ON m.id = a.merchant_id
       LEFT JOIN users u ON u.id = m.sales_user_id
       WHERE 1=1 ${periodSql}
       GROUP BY m.sales_user_id, salesName
       ORDER BY unfollowed DESC, maxStaleDays DESC, salesName ASC`
    )
    .all(...args) as unknown as SalesAccountabilityRow[];
}

export function getSalesAccountabilityRow(
  salesUserId: number | null,
  period?: PeriodType,
  salesName?: string
): SalesAccountabilityRow | null {
  return (
    getSalesAccountability(period).find(
      (row) => row.salesUserId === salesUserId && (salesName == null || row.salesName === salesName)
    ) ?? null
  );
}

export interface WeeklyAlertDigest {
  total: number;
  followed: number;
  unfollowed: number;
  pendingAdminRead: number;
  followRatePercent: number;
  topUnfollowedSales: Array<{ salesName: string; unfollowed: number }>;
}

export function getWeeklyAlertDigest(): WeeklyAlertDigest {
  const summary = getAlertOversightSummary();
  const followed = summary.total - summary.unfollowed;
  const followRatePercent =
    summary.total > 0 ? Math.round((followed / summary.total) * 100) : 100;
  const topUnfollowedSales = getSalesAccountability()
    .filter((r) => r.unfollowed > 0)
    .slice(0, 3)
    .map((r) => ({ salesName: r.salesName, unfollowed: r.unfollowed }));

  return {
    total: summary.total,
    followed,
    unfollowed: summary.unfollowed,
    pendingAdminRead: summary.pendingAdminRead,
    followRatePercent,
    topUnfollowedSales,
  };
}

export function enrichAdminAlertFields(alert: {
  acknowledged: number;
  admin_read: number;
  has_leader_reply: number;
  computed_at: string;
  merchant_id: number;
  period: string;
  current_label: string;
  sales_user_id: number | null;
}): {
  leader_pending_reply: number;
  stale: number;
  pending_admin_read: number;
  has_sales_leader: number;
} {
  let leader_pending_reply = 0;
  let has_sales_leader = 0;
  if (alert.sales_user_id != null) {
    has_sales_leader = db
      .prepare(`SELECT CASE WHEN EXISTS (
        SELECT 1 FROM leader_team_members ltm WHERE ltm.sales_user_id = ?
      ) THEN 1 ELSE 0 END as v`)
      .get(alert.sales_user_id)!.v as number;

    if (alert.acknowledged && has_sales_leader && !alert.has_leader_reply) {
      leader_pending_reply = 1;
    }
  }

  const pending_admin_read =
    alert.acknowledged && !alert.admin_read && (!has_sales_leader || !!alert.has_leader_reply)
      ? 1
      : 0;
  const staleRow = db
    .prepare(
      `SELECT CASE WHEN ? = 0 AND julianday('now', 'localtime') - julianday(?) >= ? THEN 1 ELSE 0 END as v`
    )
    .get(alert.acknowledged, alert.computed_at, STALE_DAYS) as { v: number };
  const stale = staleRow.v;

  return { leader_pending_reply, stale, pending_admin_read, has_sales_leader };
}
