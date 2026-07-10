import { db } from "./db.js";
import type { AuthUser } from "./auth.js";

export type ActionType =
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DELETE"
  | "USER_PASSWORD_RESET"
  | "IMPORT_DATA"
  | "ALERT_RULE_UPDATE"
  | "ALERT_ACK"
  | "FOLLOW_UP_CREATE"
  | "FOLLOW_UP_REPLY"
  | "MERCHANT_SALES_ASSIGN"
  | "SYSTEM_LOGIN";

export interface AuditLogEntry {
  id: number;
  user_id: number;
  user_name: string;
  action_type: string;
  target_type?: string;
  target_id?: number;
  target_name?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

export function logAction(
  user: AuthUser,
  actionType: ActionType,
  options: {
    targetType?: string;
    targetId?: number;
    targetName?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  } = {}
): void {
  try {
    db.prepare(`
      INSERT INTO audit_logs
      (user_id, user_name, action_type, target_type, target_id, target_name, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.displayName,
      actionType,
      options.targetType ?? null,
      options.targetId ?? null,
      options.targetName ?? null,
      options.details ? JSON.stringify(options.details) : null,
      options.ipAddress ?? null
    );
  } catch {
    console.warn("Failed to write audit log");
  }
}

export function getAuditLogs(
  userId?: number,
  actionType?: string,
  limit: number = 100
): AuditLogEntry[] {
  let sql = `SELECT * FROM audit_logs WHERE 1=1`;
  const params: (number | string)[] = [];

  if (userId !== undefined) {
    sql += ` AND user_id = ?`;
    params.push(userId);
  }

  if (actionType) {
    sql += ` AND action_type = ?`;
    params.push(actionType);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params) as unknown as AuditLogEntry[];
}

export function getRecentAuditLogs(limit: number = 50): AuditLogEntry[] {
  return db
    .prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as unknown as AuditLogEntry[];
}