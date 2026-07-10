import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canReadMerchant, canWriteMerchant } from "./access.js";
import { db, runTransaction } from "./db.js";
import { leaderCanAccessSales } from "./leaderTeam.js";

export type FollowUpType = "alert" | "failure";

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
export const uploadDir = process.env.UPLOAD_PATH ?? path.join(path.dirname(dbPath), "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export function alertRefKey(period: string, currentLabel: string): string {
  return `${period}|${currentLabel}`;
}

export function failureRefKey(start: string, end: string): string {
  return `${start}|${end}`;
}

export function followUpItemKey(merchantId: number, type: FollowUpType, refKey: string): string {
  return `${merchantId}:${type}:${refKey}`;
}

export interface FollowUpAttachmentRow {
  id: number;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface FollowUpReplyRow {
  id: number;
  replierName: string;
  replierRole: "admin" | "leader";
  replyText: string;
  createdAt: string;
}

export interface FollowUpRow {
  id: number;
  merchantId: number;
  merchantName: string;
  salesUserId: number;
  salesName: string;
  type: FollowUpType;
  refKey: string;
  actionText: string;
  createdAt: string;
  attachments: FollowUpAttachmentRow[];
  replies: FollowUpReplyRow[];
}

function getMerchantForRead(
  merchantId: number,
  userId: number,
  role: string
): { id: number; sales_user_id: number | null } | null {
  const m = db
    .prepare(`SELECT id, sales_user_id FROM merchants WHERE id = ?`)
    .get(merchantId) as { id: number; sales_user_id: number | null } | undefined;
  if (!m) return null;
  if (!canReadMerchant(role as "admin" | "sales" | "leader", userId, m.sales_user_id)) return null;
  return m;
}

function getMerchantForWrite(
  merchantId: number,
  userId: number,
  role: string
): { id: number; sales_user_id: number | null } | null {
  const m = db
    .prepare(`SELECT id, sales_user_id FROM merchants WHERE id = ?`)
    .get(merchantId) as { id: number; sales_user_id: number | null } | undefined;
  if (!m) return null;
  if (!canWriteMerchant(role as "admin" | "sales" | "leader", userId, m.sales_user_id)) return null;
  return m;
}

function loadReplies(followUpId: number): FollowUpReplyRow[] {
  return db
    .prepare(
      `SELECT r.id,
        COALESCE(u.display_name, CASE WHEN u.role = 'leader' THEN '主管' ELSE '管理員' END) as replierName,
        u.role as replierRole,
        r.reply_text as replyText, r.created_at as createdAt
       FROM follow_up_replies r
       JOIN users u ON u.id = r.admin_user_id
       WHERE r.follow_up_id = ?
       ORDER BY r.created_at ASC`
    )
    .all(followUpId) as unknown as FollowUpReplyRow[];
}

function ackAlertForFollowUp(merchantId: number, refKey: string): void {
  const pipe = refKey.indexOf("|");
  if (pipe <= 0) return;
  const period = refKey.slice(0, pipe);
  const currentLabel = refKey.slice(pipe + 1);
  db.prepare(
    `UPDATE alerts SET acknowledged = 1
     WHERE merchant_id = ? AND period = ? AND current_label = ?`
  ).run(merchantId, period, currentLabel);
}

function mapFollowUp(row: {
  id: number;
  merchant_id: number;
  merchant_name: string;
  sales_user_id: number;
  sales_name: string;
  type: FollowUpType;
  ref_key: string;
  action_text: string;
  created_at: string;
}): FollowUpRow {
  const attachments = db
    .prepare(
      `SELECT id, original_name as originalName, mime_type as mimeType,
        file_size as fileSize, created_at as createdAt
       FROM follow_up_attachments WHERE follow_up_id = ? ORDER BY id`
    )
    .all(row.id) as unknown as FollowUpAttachmentRow[];

  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    salesUserId: row.sales_user_id,
    salesName: row.sales_name,
    type: row.type,
    refKey: row.ref_key,
    actionText: row.action_text,
    createdAt: row.created_at,
    attachments,
    replies: loadReplies(row.id),
  };
}

export function listFollowUps(
  merchantId: number,
  type: FollowUpType,
  refKey: string,
  userId: number,
  role: string
): FollowUpRow[] {
  if (!getMerchantForRead(merchantId, userId, role)) return [];

  const rows = db
    .prepare(
      `SELECT f.id, f.merchant_id, m.name as merchant_name, f.sales_user_id,
        COALESCE(u.display_name, '未知') as sales_name,
        f.type, f.ref_key, f.action_text, f.created_at
       FROM follow_ups f
       JOIN merchants m ON m.id = f.merchant_id
       JOIN users u ON u.id = f.sales_user_id
       WHERE f.merchant_id = ? AND f.type = ? AND f.ref_key = ?
       ORDER BY f.created_at DESC`
    )
    .all(merchantId, type, refKey) as Array<{
    id: number;
    merchant_id: number;
    merchant_name: string;
    sales_user_id: number;
    sales_name: string;
    type: FollowUpType;
    ref_key: string;
    action_text: string;
    created_at: string;
  }>;

  return rows.map(mapFollowUp);
}

export function batchLatestFollowUps(
  items: Array<{ merchantId: number; type: FollowUpType; refKey: string }>,
  userId: number,
  role: string
): Record<string, { count: number; latestAt: string; latestPreview: string; salesName: string }> {
  const result: Record<
    string,
    { count: number; latestAt: string; latestPreview: string; salesName: string }
  > = {};

  for (const item of items) {
    if (!getMerchantForRead(item.merchantId, userId, role)) continue;
    const key = followUpItemKey(item.merchantId, item.type, item.refKey);
    const row = db
      .prepare(
        `SELECT f.created_at, f.action_text,
          COALESCE(u.display_name, '未知') as sales_name,
          (SELECT COUNT(*) FROM follow_ups f2
           WHERE f2.merchant_id = ? AND f2.type = ? AND f2.ref_key = ?) as cnt
         FROM follow_ups f
         JOIN users u ON u.id = f.sales_user_id
         WHERE f.merchant_id = ? AND f.type = ? AND f.ref_key = ?
         ORDER BY f.created_at DESC LIMIT 1`
      )
      .get(
        item.merchantId,
        item.type,
        item.refKey,
        item.merchantId,
        item.type,
        item.refKey
      ) as
      | { created_at: string; action_text: string; sales_name: string; cnt: number }
      | undefined;

    if (row && row.cnt > 0) {
      const preview =
        row.action_text.length > 48 ? `${row.action_text.slice(0, 48)}…` : row.action_text;
      result[key] = {
        count: row.cnt,
        latestAt: row.created_at,
        latestPreview: preview,
        salesName: row.sales_name,
      };
    }
  }

  return result;
}

export function listFollowUpsForSales(salesUserId: number, limit = 50): FollowUpRow[] {
  const rows = db
    .prepare(
      `SELECT f.id, f.merchant_id, m.name as merchant_name, f.sales_user_id,
        COALESCE(u.display_name, '未知') as sales_name,
        f.type, f.ref_key, f.action_text, f.created_at
       FROM follow_ups f
       JOIN merchants m ON m.id = f.merchant_id
       JOIN users u ON u.id = f.sales_user_id
       WHERE f.sales_user_id = ?
       ORDER BY f.created_at DESC LIMIT ?`
    )
    .all(salesUserId, limit) as Array<{
    id: number;
    merchant_id: number;
    merchant_name: string;
    sales_user_id: number;
    sales_name: string;
    type: FollowUpType;
    ref_key: string;
    action_text: string;
    created_at: string;
  }>;

  return rows.map(mapFollowUp);
}

interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export function createFollowUp(
  merchantId: number,
  type: FollowUpType,
  refKey: string,
  actionText: string,
  userId: number,
  role: string,
  files: UploadFile[]
): FollowUpRow {
  if (role === "admin") {
    throw new Error("ADMIN_CANNOT_SUBMIT");
  }

  const merchant = getMerchantForWrite(merchantId, userId, role);
  if (!merchant) {
    throw new Error("FORBIDDEN");
  }

  const text = actionText.trim();
  if (!text) {
    throw new Error("EMPTY_TEXT");
  }
  if (files.length > MAX_FILES) {
    throw new Error("TOO_MANY_FILES");
  }

  for (const f of files) {
    if (!ALLOWED_MIME.has(f.mimetype)) {
      throw new Error("INVALID_MIME");
    }
    if (f.size > MAX_FILE_BYTES) {
      throw new Error("FILE_TOO_LARGE");
    }
  }

  let followUpId = 0;

  runTransaction(() => {
    const ins = db
      .prepare(
        `INSERT INTO follow_ups (merchant_id, sales_user_id, type, ref_key, action_text)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(merchantId, userId, type, refKey, text);
    followUpId = Number(ins.lastInsertRowid);

    const insertAtt = db.prepare(
      `INSERT INTO follow_up_attachments
       (follow_up_id, stored_name, original_name, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?)`
    );

    for (const f of files) {
      const ext =
        f.mimetype === "image/png" ? ".png" : f.mimetype === "image/webp" ? ".webp" : ".jpg";
      const storedName = `${crypto.randomUUID()}${ext}`;
      fs.writeFileSync(path.join(uploadDir, storedName), f.buffer);
      insertAtt.run(followUpId, storedName, f.originalname, f.mimetype, f.size);
    }

    if (type === "alert") {
      ackAlertForFollowUp(merchantId, refKey);
    }
  });

  const rows = listFollowUps(merchantId, type, refKey, userId, role);
  const created = rows.find((r) => r.id === followUpId);
  if (!created) throw new Error("CREATE_FAILED");
  return created;
}

export function getAttachmentForUser(
  attachmentId: number,
  userId: number,
  role: string
): { storedName: string; mimeType: string; originalName: string } | null {
  const row = db
    .prepare(
      `SELECT a.stored_name, a.mime_type, a.original_name, m.id as merchant_id, m.sales_user_id
       FROM follow_up_attachments a
       JOIN follow_ups f ON f.id = a.follow_up_id
       JOIN merchants m ON m.id = f.merchant_id
       WHERE a.id = ?`
    )
    .get(attachmentId) as
    | {
        stored_name: string;
        mime_type: string;
        original_name: string;
        merchant_id: number;
        sales_user_id: number | null;
      }
    | undefined;

  if (!row) return null;
  if (!canReadMerchant(role as "admin" | "sales" | "leader", userId, row.sales_user_id)) return null;

  return {
    storedName: row.stored_name,
    mimeType: row.mime_type,
    originalName: row.original_name,
  };
}

export function createFollowUpReply(
  followUpId: number,
  userId: number,
  role: "admin" | "leader",
  replyText: string
): FollowUpReplyRow {
  const text = replyText.trim();
  if (!text) throw new Error("EMPTY_TEXT");

  const followUp = db
    .prepare(`SELECT id, merchant_id, sales_user_id FROM follow_ups WHERE id = ?`)
    .get(followUpId) as { id: number; merchant_id: number; sales_user_id: number } | undefined;
  if (!followUp) throw new Error("NOT_FOUND");

  if (role === "admin") {
    const merchant = db
      .prepare(`SELECT sales_user_id FROM merchants WHERE id = ?`)
      .get(followUp.merchant_id) as { sales_user_id: number | null } | undefined;
    if (!merchant || !canReadMerchant("admin", userId, merchant.sales_user_id)) {
      throw new Error("FORBIDDEN");
    }
  } else if (role === "leader") {
    if (followUp.sales_user_id === userId) throw new Error("FORBIDDEN");
    if (!leaderCanAccessSales(userId, followUp.sales_user_id)) throw new Error("FORBIDDEN");
  } else {
    throw new Error("FORBIDDEN");
  }

  const ins = db
    .prepare(
      `INSERT INTO follow_up_replies (follow_up_id, admin_user_id, reply_text) VALUES (?, ?, ?)`
    )
    .run(followUpId, userId, text);

  const row = db
    .prepare(
      `SELECT r.id,
        COALESCE(u.display_name, CASE WHEN u.role = 'leader' THEN '主管' ELSE '管理員' END) as replierName,
        u.role as replierRole,
        r.reply_text as replyText, r.created_at as createdAt
       FROM follow_up_replies r
       JOIN users u ON u.id = r.admin_user_id
       WHERE r.id = ?`
    )
    .get(Number(ins.lastInsertRowid)) as unknown as FollowUpReplyRow;

  return row;
}

export function repairAckAlertsFromFollowUps(): number {
  const r = db.prepare(
    `UPDATE alerts SET acknowledged = 1
     WHERE acknowledged = 0 AND EXISTS (
       SELECT 1 FROM follow_ups f
       WHERE f.merchant_id = alerts.merchant_id
         AND f.type = 'alert'
         AND f.ref_key = alerts.period || '|' || alerts.current_label
     )`
  ).run();
  return Number(r.changes);
}

/** 已讀僅與跟進記錄同步：有跟進→已讀，無跟進→未讀 */
export function syncAlertAckFromFollowUps(): { acked: number; unacked: number } {
  const unacked = db.prepare(
    `UPDATE alerts SET acknowledged = 0
     WHERE acknowledged = 1 AND NOT EXISTS (
       SELECT 1 FROM follow_ups f
       WHERE f.merchant_id = alerts.merchant_id
         AND f.type = 'alert'
         AND f.ref_key = alerts.period || '|' || alerts.current_label
     )`
  ).run();
  return {
    acked: repairAckAlertsFromFollowUps(),
    unacked: Number(unacked.changes),
  };
}

export function markLeaderFollowUpRead(
  leaderUserId: number,
  merchantId: number,
  type: FollowUpType,
  refKey: string
): boolean {
  const merchant = db
    .prepare(`SELECT sales_user_id FROM merchants WHERE id = ?`)
    .get(merchantId) as { sales_user_id: number | null } | undefined;
  if (!merchant?.sales_user_id) return false;
  if (merchant.sales_user_id === leaderUserId) return false;
  if (!leaderCanAccessSales(leaderUserId, merchant.sales_user_id)) return false;

  db.prepare(
    `INSERT INTO leader_follow_up_reads (leader_user_id, merchant_id, type, ref_key, read_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(leader_user_id, merchant_id, type, ref_key)
     DO UPDATE SET read_at = datetime('now')`
  ).run(leaderUserId, merchantId, type, refKey);
  return true;
}

/** 管理員已閱：查看跟進即可標記，無需回覆 */
export function markAdminFollowUpRead(
  adminUserId: number,
  merchantId: number,
  type: FollowUpType,
  refKey: string
): boolean {
  const merchant = db
    .prepare(`SELECT sales_user_id FROM merchants WHERE id = ?`)
    .get(merchantId) as { sales_user_id: number | null } | undefined;
  if (!merchant || !canReadMerchant("admin", adminUserId, merchant.sales_user_id)) {
    return false;
  }

  const hasLeader = db
    .prepare(
      `SELECT CASE WHEN EXISTS (
        SELECT 1 FROM leader_team_members ltm WHERE ltm.sales_user_id = ?
      ) THEN 1 ELSE 0 END as v`
    )
    .get(merchant.sales_user_id) as { v: number } | undefined;

  if (hasLeader?.v && merchant.sales_user_id != null) {
    const leaderReplied = db
      .prepare(
        `SELECT CASE WHEN EXISTS (
          SELECT 1 FROM leader_team_members ltm
          JOIN follow_ups f ON f.merchant_id = ? AND f.type = ? AND f.ref_key = ?
          JOIN follow_up_replies r ON r.follow_up_id = f.id AND r.admin_user_id = ltm.leader_user_id
          WHERE ltm.sales_user_id = ?
        ) THEN 1 ELSE 0 END as v`
      )
      .get(merchantId, type, refKey, merchant.sales_user_id) as { v: number };
    if (!leaderReplied.v) return false;
  }

  db.prepare(
    `INSERT INTO admin_follow_up_reads (admin_user_id, merchant_id, type, ref_key, read_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(admin_user_id, merchant_id, type, ref_key)
     DO UPDATE SET read_at = datetime('now')`
  ).run(adminUserId, merchantId, type, refKey);
  return true;
}

export function getFollowUpForReply(
  followUpId: number,
  userId: number,
  role: string
): { merchantId: number } | null {
  const row = db
    .prepare(
      `SELECT f.merchant_id, m.sales_user_id
       FROM follow_ups f JOIN merchants m ON m.id = f.merchant_id WHERE f.id = ?`
    )
    .get(followUpId) as { merchant_id: number; sales_user_id: number | null } | undefined;
  if (!row) return null;
  if (!canReadMerchant(role as "admin" | "sales" | "leader", userId, row.sales_user_id)) return null;
  return { merchantId: row.merchant_id };
}
