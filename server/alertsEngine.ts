import { db, runTransaction } from "./db.js";
import { getPeriodChange, formatChangePercent, type PeriodType } from "./analytics.js";
import { getLeaderSalesUserIds } from "./leaderTeam.js";

/** 预警支持的统计周期（不含日） */
export const ALERT_PERIODS = ["week", "month"] as const;
export type AlertPeriod = (typeof ALERT_PERIODS)[number];

function isAlertPeriod(p: string): p is AlertPeriod {
  return (ALERT_PERIODS as readonly string[]).includes(p);
}

interface AlertRule {
  id: number;
  period: PeriodType;
  threshold_percent: number;
  direction: "decrease" | "increase";
  enabled: number;
}

export function recomputeAllAlerts() {
  db.prepare("DELETE FROM alerts").run();

  const rules = db
    .prepare("SELECT * FROM alert_rules WHERE enabled = 1 AND period IN ('week', 'month')")
    .all() as unknown as AlertRule[];
  const merchants = db.prepare("SELECT id, name FROM merchants").all() as {
    id: number;
    name: string;
  }[];

  const insert = db.prepare(`
    INSERT OR REPLACE INTO alerts
    (merchant_id, period, current_label, previous_label, current_amount, previous_amount, change_percent, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  runTransaction(() => {
    for (const m of merchants) {
      for (const rule of rules) {
        const { current, previous, changePercent } = getPeriodChange(m.id, rule.period);
        if (!current || !previous || changePercent === null) continue;

        const triggered =
          rule.direction === "decrease"
            ? changePercent <= -rule.threshold_percent
            : changePercent >= rule.threshold_percent;

        if (!triggered) continue;

        const periodLabel = rule.period === "week" ? "週" : "月";
        const dirLabel = rule.direction === "decrease" ? "下降" : "上升";
        const message = `【預警】商戶「${m.name}」${periodLabel}環比${dirLabel} ${formatChangePercent(Math.abs(changePercent))}%（${previous.label} HKD ${previous.amount.toLocaleString()} → ${current.label} HKD ${current.amount.toLocaleString()}），已超過 ${rule.threshold_percent}% 閾值`;

        insert.run(
          m.id,
          rule.period,
          current.label,
          previous.label,
          current.amount,
          previous.amount,
          changePercent,
          message
        );
      }
    }
  });
}

const ALERT_REF_KEY = `(a.period || '|' || a.current_label)`;

/** 管理員已閱（查看跟進即可，無需回覆） */
export const ADMIN_READ_EXISTS = `EXISTS (
  SELECT 1 FROM admin_follow_up_reads ar
  WHERE ar.merchant_id = a.merchant_id
    AND ar.type = 'alert'
    AND ar.ref_key = ${ALERT_REF_KEY}
)`;

/** 歸屬主管已回覆（必須提交回覆） */
export const LEADER_REPLY_EXISTS = `EXISTS (
  SELECT 1 FROM leader_team_members ltm
  JOIN follow_ups f ON f.merchant_id = a.merchant_id
    AND f.type = 'alert'
    AND f.ref_key = ${ALERT_REF_KEY}
  JOIN follow_up_replies r ON r.follow_up_id = f.id
    AND r.admin_user_id = ltm.leader_user_id
  WHERE ltm.sales_user_id = m.sales_user_id
)`;

function alertEnrichmentSelect(leaderUserId: number | null): string {
  const leaderRepliedCase =
    leaderUserId != null
      ? `CASE WHEN EXISTS (
          SELECT 1 FROM follow_ups f
          JOIN follow_up_replies r ON r.follow_up_id = f.id
          WHERE f.merchant_id = a.merchant_id
            AND f.type = 'alert'
            AND f.ref_key = ${ALERT_REF_KEY}
            AND r.admin_user_id = ${leaderUserId}
        ) THEN 1 ELSE 0 END`
      : `CASE WHEN ${LEADER_REPLY_EXISTS} THEN 1 ELSE 0 END`;

  return `
    SELECT a.*, m.name as merchant_name, m.sales_user_id,
      COALESCE(NULLIF(TRIM(m.sales_name), ''), u.display_name, '待分配') as sales_name,
      CASE WHEN ${ADMIN_READ_EXISTS} THEN 1 ELSE 0 END as admin_read,
      ${leaderRepliedCase} as has_leader_reply`;
}

export function getAlertsForUser(userId: number, role: string, period?: PeriodType) {
  const filterPeriod = period && isAlertPeriod(period) ? period : undefined;
  const periodClause = filterPeriod ? "AND a.period = ?" : "AND a.period IN ('week', 'month')";
  const leaderUserId = role === "leader" ? userId : null;
  const select = alertEnrichmentSelect(leaderUserId);
  const orderBy =
    "ORDER BY a.acknowledged ASC, (a.previous_amount - a.current_amount) DESC, a.computed_at DESC";

  if (role === "admin") {
    const sql = `${select}
      FROM alerts a
      JOIN merchants m ON m.id = a.merchant_id
      LEFT JOIN users u ON u.id = m.sales_user_id
      WHERE 1=1 ${periodClause}
      ${orderBy}`;
    return filterPeriod ? db.prepare(sql).all(filterPeriod) : db.prepare(sql).all();
  }

  if (role === "leader") {
    const teamIds = getLeaderSalesUserIds(userId);
    const ids = [userId, ...teamIds];
    const placeholders = ids.map(() => "?").join(", ");
    const sql = `${select}
      FROM alerts a
      JOIN merchants m ON m.id = a.merchant_id
      LEFT JOIN users u ON u.id = m.sales_user_id
      WHERE m.sales_user_id IN (${placeholders}) ${periodClause}
      ${orderBy}`;
    return filterPeriod
      ? db.prepare(sql).all(...ids, filterPeriod)
      : db.prepare(sql).all(...ids);
  }

  const sql = `${select}
    FROM alerts a
    JOIN merchants m ON m.id = a.merchant_id
    LEFT JOIN users u ON u.id = m.sales_user_id
    WHERE m.sales_user_id = ? ${periodClause}
    ${orderBy}`;
  return filterPeriod ? db.prepare(sql).all(userId, filterPeriod) : db.prepare(sql).all(userId);
}

export function getAlertsForSalesUser(salesUserId: number, leaderUserId: number | null = null) {
  const select = alertEnrichmentSelect(leaderUserId);
  const sql = `${select}
    FROM alerts a
    JOIN merchants m ON m.id = a.merchant_id
    LEFT JOIN users u ON u.id = m.sales_user_id
    WHERE m.sales_user_id = ? AND a.period IN ('week', 'month')
    ORDER BY a.acknowledged ASC, (a.previous_amount - a.current_amount) DESC, a.computed_at DESC`;
  return db.prepare(sql).all(salesUserId);
}

/** 管理員督辦：某銷售（或待分配）名下全部預警 */
export function buildAdminSalesScopeClause(
  salesUserId: number | null,
  salesName?: string | null
): { clause: string; args: (string | number)[] } {
  if (salesUserId != null) {
    return { clause: "AND m.sales_user_id = ?", args: [salesUserId] };
  }

  const label = salesName?.trim() || "待分配";
  if (label === "待分配") {
    return {
      clause: "AND m.sales_user_id IS NULL AND (m.sales_name IS NULL OR TRIM(m.sales_name) = '')",
      args: [],
    };
  }

  return {
    clause: "AND m.sales_user_id IS NULL AND COALESCE(NULLIF(TRIM(m.sales_name), ''), '待分配') = ?",
    args: [label],
  };
}

/** 管理員督辦：某銷售（或待分配）名下全部預警 */
export function getAdminAlertsForSalesUser(
  salesUserId: number | null,
  period?: PeriodType,
  salesName?: string | null
) {
  const filterPeriod = period && isAlertPeriod(period) ? period : undefined;
  const periodClause = filterPeriod ? "AND a.period = ?" : "AND a.period IN ('week', 'month')";
  const { clause: salesClause, args: salesArgs } = buildAdminSalesScopeClause(salesUserId, salesName);
  const params: (string | number)[] = [...salesArgs];
  if (filterPeriod) params.push(filterPeriod);

  const select = alertEnrichmentSelect(null);
  const sql = `${select}
    FROM alerts a
    JOIN merchants m ON m.id = a.merchant_id
    LEFT JOIN users u ON u.id = m.sales_user_id
    WHERE 1=1 ${salesClause} ${periodClause}
    ORDER BY a.acknowledged ASC, (a.previous_amount - a.current_amount) DESC, a.computed_at DESC`;
  return db.prepare(sql).all(...params);
}
