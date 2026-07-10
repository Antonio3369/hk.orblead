import { db, runTransaction } from "./db.js";
import { getAlertsForSalesUser } from "./alertsEngine.js";
import {
  getSalesPeriodComparison,
  getTigerTeamDashboardSummary,
  getTigerTeamSalesUser,
  listTigerTeamSales,
} from "./tigerTeam.js";
import { listMerchantInsightsForSales, summarizeMerchantInsights } from "./merchantInsights.js";

export function getLeaderSalesUserIds(leaderId: number): number[] {
  const rows = db
    .prepare(`SELECT sales_user_id FROM leader_team_members WHERE leader_user_id = ?`)
    .all(leaderId) as { sales_user_id: number }[];
  return rows.map((r) => r.sales_user_id);
}

export function leaderCanAccessSales(leaderId: number, salesUserId: number): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM leader_team_members WHERE leader_user_id = ? AND sales_user_id = ?`
    )
    .get(leaderId, salesUserId);
  return !!row;
}

export function getSalesLeaderAssignment(salesUserId: number): {
  leaderId: number;
  leaderName: string;
} | null {
  const row = db
    .prepare(
      `SELECT l.id as leaderId, l.display_name as leaderName
       FROM leader_team_members m
       JOIN users l ON l.id = m.leader_user_id
       WHERE m.sales_user_id = ?`
    )
    .get(salesUserId) as { leaderId: number; leaderName: string } | undefined;
  return row ?? null;
}

export function listSalesForTeamPicker(currentLeaderId: number) {
  return db
    .prepare(
      `SELECT u.id, u.display_name as displayName, u.username,
        m.leader_user_id as assignedLeaderId,
        l.display_name as assignedLeaderName
       FROM users u
       LEFT JOIN leader_team_members m ON m.sales_user_id = u.id
       LEFT JOIN users l ON l.id = m.leader_user_id
       WHERE u.role = 'sales' AND COALESCE(u.enabled, 1) = 1
       ORDER BY u.display_name`
    )
    .all() as {
    id: number;
    displayName: string;
    username: string;
    assignedLeaderId: number | null;
    assignedLeaderName: string | null;
  }[];
}

export function getLeaderTeamMemberRows(leaderId: number) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.display_name as displayName
       FROM leader_team_members l
       JOIN users u ON u.id = l.sales_user_id
       WHERE l.leader_user_id = ? AND u.role = 'sales' AND COALESCE(u.enabled, 1) = 1
       ORDER BY u.display_name`
    )
    .all(leaderId) as { id: number; username: string; displayName: string }[];
}

export function setLeaderTeamMembers(leaderId: number, salesUserIds: number[]) {
  const unique = [...new Set(salesUserIds)];
  for (const sid of unique) {
    const sales = db
      .prepare(`SELECT id FROM users WHERE id = ? AND role = 'sales' AND COALESCE(enabled, 1) = 1`)
      .get(sid);
    if (!sales) {
      throw new Error(`銷售 ID ${sid} 不存在或不可分配`);
    }
    const taken = db
      .prepare(
        `SELECT leader_user_id FROM leader_team_members WHERE sales_user_id = ? AND leader_user_id != ?`
      )
      .get(sid, leaderId) as { leader_user_id: number } | undefined;
    if (taken) {
      throw new Error(`銷售已被其他主管管轄`);
    }
  }

  runTransaction(() => {
    db.prepare(`DELETE FROM leader_team_members WHERE leader_user_id = ?`).run(leaderId);
    const insert = db.prepare(
      `INSERT INTO leader_team_members (leader_user_id, sales_user_id) VALUES (?, ?)`
    );
    for (const sid of unique) {
      insert.run(leaderId, sid);
    }
  });
}

export function clearLeaderTeam(leaderId: number) {
  db.prepare(`DELETE FROM leader_team_members WHERE leader_user_id = ?`).run(leaderId);
}

export function listLeaderTeamSales(leaderId: number) {
  const ids = getLeaderSalesUserIds(leaderId);
  if (ids.length === 0) return [];
  return listTigerTeamSales(ids);
}

export function getLeaderTeamDashboardSummary(leaderId: number) {
  const ids = getLeaderSalesUserIds(leaderId);
  return getTigerTeamDashboardSummary(ids);
}

export function getLeaderTeamSalesDetail(leaderId: number, salesUserId: number) {
  if (!leaderCanAccessSales(leaderId, salesUserId)) return null;
  const sales = getTigerTeamSalesUser(salesUserId);
  if (!sales) return null;
  const merchants = listMerchantInsightsForSales(salesUserId);
  return {
    sales,
    periods: getSalesPeriodComparison(salesUserId),
    alerts: getAlertsForSalesUser(salesUserId, leaderId),
    insightSummary: summarizeMerchantInsights(merchants),
    merchants,
  };
}
