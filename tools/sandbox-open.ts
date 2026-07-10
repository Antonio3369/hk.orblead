/**
 * 启动可交互沙箱看板（模拟生产异常 → 可手动试修复）
 *
 * 用法：npm run sandbox:open
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

process.env.DATABASE_PATH = path.join(root, "data", "sandbox-live.db");

const SAM_XLSX =
  process.env.SAM_XLSX ?? "/Users/Eric/Desktop/agent/数据/sam202512.xlsx";
const ORG_XLSX =
  process.env.ORG_XLSX ??
  "/Users/Eric/Desktop/agent/数据/54516685_機构交易數據報表_2026-07-01.xlsx";
const DB_PATH = process.env.DATABASE_PATH;

for (const ext of ["", "-wal", "-shm"]) {
  const f = DB_PATH + ext;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

async function main() {
  const { hashPassword } = await import("../server/auth.js");
  const { initSchema, db } = await import("../server/db.js");
  const { importTransactionFile } = await import("../server/importService.js");

  initSchema();

  async function seedUser(
    username: string,
    password: string,
    displayName: string,
    role: "admin" | "sales" | "leader"
  ) {
    const hash = await hashPassword(password);
    db.prepare(
      `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`
    ).run(username, hash, displayName, role);
  }

  await seedUser("admin", "admin123", "管理员", "admin");
  await seedUser("sam202512", "sales123", "Sam", "leader");
  await seedUser("Winnie202512", "sales123", "Winnie", "sales");

  if (!fs.existsSync(SAM_XLSX)) {
    console.error(`缺少: ${SAM_XLSX}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(SAM_XLSX);
  importTransactionFile(buf, "sam202512.xlsx", 1, "append", "sam202512");

  const samId = (db.prepare(`SELECT id FROM users WHERE username = 'sam202512'`).get() as { id: number })
    .id;
  const winnieId = (
    db.prepare(`SELECT id FROM users WHERE username = 'Winnie202512'`).get() as { id: number }
  ).id;

  const merchants = db
    .prepare(
      `SELECT DISTINCT m.id
       FROM merchants m
       JOIN transactions t ON t.merchant_id = m.id
       WHERE m.sales_user_id = ? AND substr(t.txn_time, 1, 7) = '2026-07'
       ORDER BY m.id`
    )
    .all(samId) as { id: number }[];
  const half = merchants.slice(0, Math.ceil(merchants.length / 2));
  const upd = db.prepare(`UPDATE merchants SET sales_user_id = ?, sales_name = ? WHERE id = ?`);
  for (const m of half) upd.run(winnieId, "Winnie202512", m.id);

  const row = db
    .prepare(
      `SELECT COALESCE(SUM(t.amount), 0) AS amt, COUNT(*) AS cnt, COUNT(DISTINCT m.id) AS mc
       FROM transactions t JOIN merchants m ON m.id = t.merchant_id
       WHERE m.sales_user_id = ? AND substr(t.txn_time, 1, 7) = '2026-07'`
    )
    .get(samId) as { amt: number; cnt: number; mc: number };

  console.log("\n沙箱已就绪（模拟归属错误，7 月数据偏少）");
  console.log(`  sam202512 7月: ${row.amt.toLocaleString()} / ${row.cnt} 笔 / ${row.mc} 商户`);
  console.log(`  数据库: ${DB_PATH}`);
  if (fs.existsSync(ORG_XLSX)) {
    console.log(`\n修复试验：admin 后台追加导入\n  ${path.basename(ORG_XLSX)}`);
  }
  console.log("\n登录账号:");
  console.log("  admin / admin123  （可导入数据）");
  console.log("  sam202512 / sales123  （查看工作台）");
  console.log("\n启动看板: http://localhost:3090\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
