import { db } from "../db.js";
import { leaderCanAccessSales } from "../leaderTeam.js";
import type { UserRole } from "../auth.js";
import {
  applicationIssues,
  normalizeApplicationPayload,
  type ApplicationPayload,
} from "./fields.js";

export interface ApplicationRow {
  id: number;
  ownerUserId: number;
  ownerName: string;
  legalName: string;
  payload: ApplicationPayload;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

interface DbRow {
  id: number;
  owner_user_id: number;
  owner_name: string;
  legal_name: string;
  payload: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbRow, viewerId: number, role: UserRole): ApplicationRow {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    legalName: row.legal_name,
    payload: normalizeApplicationPayload(JSON.parse(row.payload)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canEdit: canEditApplication(role, viewerId, row.owner_user_id),
  };
}

export function canReadApplication(role: UserRole, viewerId: number, ownerUserId: number): boolean {
  if (role === "admin" || viewerId === ownerUserId) return true;
  if (role === "leader") return leaderCanAccessSales(viewerId, ownerUserId);
  return false;
}

export function canEditApplication(role: UserRole, viewerId: number, ownerUserId: number): boolean {
  return role === "admin" || viewerId === ownerUserId;
}

const SELECT = `
  SELECT a.id, a.owner_user_id, u.display_name AS owner_name, a.legal_name,
         a.payload, a.created_at, a.updated_at
  FROM merchant_applications a
  JOIN users u ON u.id = a.owner_user_id
`;

export function listApplications(role: UserRole, viewerId: number): ApplicationRow[] {
  let sql = SELECT;
  const params: number[] = [];
  if (role === "sales") {
    sql += " WHERE a.owner_user_id = ?";
    params.push(viewerId);
  } else if (role === "leader") {
    sql += ` WHERE a.owner_user_id = ?
      OR a.owner_user_id IN (
        SELECT sales_user_id FROM leader_team_members WHERE leader_user_id = ?
      )`;
    params.push(viewerId, viewerId);
  }
  sql += " ORDER BY a.updated_at DESC, a.id DESC";
  const rows = db.prepare(sql).all(...params) as unknown as DbRow[];
  return rows.map((row) => mapRow(row, viewerId, role));
}

export function getApplication(id: number, role: UserRole, viewerId: number): ApplicationRow | null {
  const row = db.prepare(`${SELECT} WHERE a.id = ?`).get(id) as unknown as DbRow | undefined;
  if (!row || !canReadApplication(role, viewerId, row.owner_user_id)) return null;
  return mapRow(row, viewerId, role);
}

export function createApplication(
  ownerUserId: number,
  role: UserRole,
  payload: ApplicationPayload
): ApplicationRow {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO merchant_applications
        (owner_user_id, legal_name, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(ownerUserId, payload.legalName, JSON.stringify(payload), now, now);
  const created = getApplication(Number(result.lastInsertRowid), role, ownerUserId);
  if (!created) throw new Error("儲存申請失敗");
  return created;
}

export function updateApplication(
  id: number,
  role: UserRole,
  viewerId: number,
  payload: ApplicationPayload
): ApplicationRow | "forbidden" | "missing" {
  const row = db
    .prepare("SELECT owner_user_id FROM merchant_applications WHERE id = ?")
    .get(id) as unknown as { owner_user_id: number } | undefined;
  if (!row) return "missing";
  if (!canReadApplication(role, viewerId, row.owner_user_id)) return "missing";
  if (!canEditApplication(role, viewerId, row.owner_user_id)) return "forbidden";
  db.prepare(
    `UPDATE merchant_applications
     SET legal_name = ?, payload = ?, updated_at = ?
     WHERE id = ?`
  ).run(payload.legalName, JSON.stringify(payload), new Date().toISOString(), id);
  const updated = getApplication(id, role, viewerId);
  if (!updated) throw new Error("更新申請失敗");
  return updated;
}

export function assertComplete(payload: ApplicationPayload): string | null {
  const issues = applicationIssues(payload);
  if (!issues.length) return null;
  return `還有未完成項：${issues.join("、")}`;
}
