import fs from "node:fs";
import path from "node:path";
import { initInsightSettings } from "./insightRules.js";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { classifyPaymentChannel } from "./paymentChannel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dbPath = process.env.DATABASE_PATH ?? path.join(dataDir, "app.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/** Node 内置 SQLite，无需安装 Xcode / better-sqlite3 */
export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export function runTransaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'sales' CHECK(role IN ('admin', 'sales', 'leader')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      imported_by INTEGER NOT NULL REFERENCES users(id),
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sales_user_id INTEGER REFERENCES users(id),
      sales_name TEXT,
      UNIQUE(name, sales_name)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      txn_name TEXT NOT NULL,
      txn_time TEXT NOT NULL,
      amount REAL NOT NULL,
      detail TEXT,
      order_no TEXT,
      batch_id INTEGER REFERENCES import_batches(id),
      UNIQUE(merchant_id, txn_name, txn_time, amount, detail)
    );

    CREATE INDEX IF NOT EXISTS idx_txn_merchant_time ON transactions(merchant_id, txn_time);
    CREATE INDEX IF NOT EXISTS idx_merchants_sales ON merchants(sales_user_id);

    CREATE TABLE IF NOT EXISTS card_failure_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      txn_name TEXT NOT NULL,
      txn_time TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      card_region TEXT,
      order_no TEXT,
      detail TEXT,
      batch_id INTEGER REFERENCES import_batches(id),
      UNIQUE(merchant_id, order_no, txn_time, status)
    );

    CREATE INDEX IF NOT EXISTS idx_card_fail_merchant_time ON card_failure_events(merchant_id, txn_time);

    CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL CHECK(period IN ('day', 'week', 'month')),
      threshold_percent REAL NOT NULL,
      direction TEXT NOT NULL DEFAULT 'decrease' CHECK(direction IN ('decrease', 'increase')),
      enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE(period, direction)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      current_label TEXT NOT NULL,
      previous_label TEXT NOT NULL,
      current_amount REAL NOT NULL,
      previous_amount REAL NOT NULL,
      change_percent REAL NOT NULL,
      message TEXT NOT NULL,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      acknowledged INTEGER NOT NULL DEFAULT 0,
      UNIQUE(merchant_id, period, current_label)
    );
  `);

  const ruleCount = db.prepare("SELECT COUNT(*) as c FROM alert_rules").get() as {
    c: number;
  };
  if (ruleCount.c === 0) {
    const insert = db.prepare(
      "INSERT INTO alert_rules (period, threshold_percent, direction, enabled) VALUES (?, ?, ?, 1)"
    );
    insert.run("week", 30, "decrease");
    insert.run("month", 30, "decrease");
  }

  // 预警仅周、月维度：停用并清理历史日预警
  db.prepare("DELETE FROM alert_rules WHERE period = 'day'").run();
  db.prepare("UPDATE alert_rules SET enabled = 1 WHERE period IN ('week', 'month')").run();
  db.prepare("DELETE FROM alerts WHERE period = 'day'").run();

  migrateColumn("users", "enabled", "INTEGER NOT NULL DEFAULT 1");
  migrateColumn("merchants", "merchant_code", "TEXT");
  migrateColumn("transactions", "pay_wallet", "TEXT");
  migrateColumn("transactions", "payment_channel", "TEXT");
  migrateColumn("transactions", "order_no", "TEXT");
  migrateTransactionOrderNo();
  migrateColumn("users", "email", "TEXT");
  migrateMerchantLimitsTables();
  backfillTransactionPaymentChannel();
  db.prepare(`UPDATE users SET enabled = 1 WHERE enabled IS NULL`).run();
  migrateUsersLeaderRole();
  migrateLeaderTeamTable();
  migrateLeaderFollowUpReadsTable();
  migrateAdminFollowUpReadsTable();
  initInsightSettings();

  db.exec(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      sales_user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('alert', 'failure')),
      ref_key TEXT NOT NULL,
      action_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_follow_ups_lookup
      ON follow_ups(merchant_id, type, ref_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS follow_up_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follow_up_id INTEGER NOT NULL REFERENCES follow_ups(id) ON DELETE CASCADE,
      stored_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS follow_up_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follow_up_id INTEGER NOT NULL REFERENCES follow_ups(id) ON DELETE CASCADE,
      admin_user_id INTEGER NOT NULL REFERENCES users(id),
      reply_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      user_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      target_name TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at);
  `);
}

function migrateColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** 已有庫的 users 表 CHECK 不含 leader，需重建表 */
function migrateUsersLeaderRole() {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get() as { sql: string } | undefined;
  if (!row?.sql || row.sql.includes("'leader'")) return;

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec(`
      CREATE TABLE users_mig (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'sales' CHECK(role IN ('admin', 'sales', 'leader')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        enabled INTEGER NOT NULL DEFAULT 1,
        email TEXT
      );
      INSERT INTO users_mig (id, username, password_hash, display_name, role, created_at, enabled, email)
        SELECT id, username, password_hash, display_name, role, created_at, COALESCE(enabled, 1), email FROM users;
      DROP TABLE users;
      ALTER TABLE users_mig RENAME TO users;
    `);
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateLeaderTeamTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leader_team_members (
      leader_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sales_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (leader_user_id, sales_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_leader_team_leader ON leader_team_members(leader_user_id);
  `);
}

function migrateLeaderFollowUpReadsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leader_follow_up_reads (
      leader_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('alert', 'failure')),
      ref_key TEXT NOT NULL,
      read_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (leader_user_id, merchant_id, type, ref_key)
    );
  `);
}

function migrateAdminFollowUpReadsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_follow_up_reads (
      admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('alert', 'failure')),
      ref_key TEXT NOT NULL,
      read_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (admin_user_id, merchant_id, type, ref_key)
    );
  `);
}

function migrateMerchantLimitsTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS limit_import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      imported_by INTEGER NOT NULL REFERENCES users(id),
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS merchant_channel_limits (
      merchant_code TEXT PRIMARY KEY,
      card_limit REAL,
      scan_limit REAL,
      batch_id INTEGER REFERENCES limit_import_batches(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_merchant_limits_code ON merchant_channel_limits(merchant_code);
  `);
  migrateColumn("merchant_channel_limits", "card_single_limit", "REAL");
  migrateColumn("merchant_channel_limits", "card_daily_limit", "REAL");
  migrateColumn("merchant_channel_limits", "scan_single_limit", "REAL");
  migrateColumn("merchant_channel_limits", "scan_daily_limit", "REAL");
}

const ORDER_NO_DETAIL_RE = /订单号:([^|\s]+)/;

/** 从 detail 回填 order_no，并建立全局订单号唯一索引（上游交易訂單號全局唯一） */
function migrateTransactionOrderNo() {
  try {
    const rows = db
      .prepare(
        `SELECT id, detail FROM transactions
         WHERE (order_no IS NULL OR TRIM(order_no) = '') AND detail LIKE '%订单号:%'`
      )
      .all() as { id: number; detail: string | null }[];

    if (rows.length > 0) {
      const used = new Set(
        (
          db
            .prepare(`SELECT order_no FROM transactions WHERE order_no IS NOT NULL AND TRIM(order_no) != ''`)
            .all() as { order_no: string }[]
        ).map((r) => r.order_no.trim())
      );
      const update = db.prepare(`UPDATE transactions SET order_no = ? WHERE id = ?`);
      runTransaction(() => {
        for (const row of rows) {
          const match = row.detail?.match(ORDER_NO_DETAIL_RE);
          if (!match?.[1]) continue;
          const orderNo = match[1].trim();
          if (used.has(orderNo)) continue;
          used.add(orderNo);
          update.run(orderNo, row.id);
        }
      });
    }

    dedupeTransactionOrderNos();
    createTransactionOrderNoIndex();
  } catch (err) {
    console.warn("order_no 迁移跳过（不影响启动）:", err instanceof Error ? err.message : err);
  }
}

function createTransactionOrderNoIndex() {
  const sql = `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_order_no
      ON transactions(order_no)
      WHERE order_no IS NOT NULL AND TRIM(order_no) != ''
  `;
  try {
    db.exec(sql);
  } catch (err) {
    console.warn(
      "order_no 唯一索引建立失败，清理重复后重试:",
      err instanceof Error ? err.message : err
    );
    dedupeTransactionOrderNos();
    try {
      db.exec(sql);
    } catch (err2) {
      console.warn(
        "order_no 唯一索引仍未建立，将沿用旧复合键去重:",
        err2 instanceof Error ? err2.message : err2
      );
    }
  }
}

/** 同一订单号保留最早一条，其余清空 order_no（仍靠旧复合唯一键去重） */
function dedupeTransactionOrderNos() {
  const dups = db
    .prepare(
      `SELECT order_no, MIN(id) as keep_id
       FROM transactions
       WHERE order_no IS NOT NULL AND TRIM(order_no) != ''
       GROUP BY order_no
       HAVING COUNT(*) > 1`
    )
    .all() as { order_no: string; keep_id: number }[];

  if (dups.length === 0) return;

  const clear = db.prepare(
    `UPDATE transactions SET order_no = NULL WHERE order_no = ? AND id != ?`
  );
  runTransaction(() => {
    for (const row of dups) {
      clear.run(row.order_no, row.keep_id);
    }
  });
}

function backfillTransactionPaymentChannel() {
  const rows = db
    .prepare(
      `SELECT id, pay_wallet, txn_name FROM transactions
       WHERE payment_channel IS NULL OR TRIM(payment_channel) = ''`
    )
    .all() as { id: number; pay_wallet: string | null; txn_name: string }[];

  if (rows.length === 0) return;

  const update = db.prepare(`UPDATE transactions SET payment_channel = ? WHERE id = ?`);
  runTransaction(() => {
    for (const row of rows) {
      update.run(classifyPaymentChannel(row.pay_wallet ?? "", row.txn_name), row.id);
    }
  });
}
