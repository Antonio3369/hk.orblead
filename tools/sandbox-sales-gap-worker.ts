/**
 * 沙箱 worker（由 sandbox-sales-gap.ts 子进程调用，每次独立 DATABASE_PATH）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDashboardMonthlyStats } from "../server/analytics.js";
import { initSchema, db } from "../server/db.js";
import { importTransactionFile } from "../server/importService.js";
import { syncMerchantSalesAssignment } from "../server/userSync.js";

const scenario = process.argv[2] ?? "A";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAM_XLSX = process.env.SAM_XLSX ?? path.join(root, "numbers", "sam202512.xlsx");
const ORG_XLSX =
  process.env.ORG_XLSX ??
  path.join(root, "numbers", "54516685_機构交易數據報表_2026-07-08.xlsx");

function fmt(n: number): string {
  return n.toLocaleString("zh-HK", { maximumFractionDigits: 2 });
}

function samJulyStats(samUserId: number) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(t.amount), 0) AS amt,
              COUNT(*) AS cnt,
              COUNT(DISTINCT m.id) AS merchants
       FROM transactions t
       JOIN merchants m ON m.id = t.merchant_id
       WHERE m.sales_user_id = ?
         AND substr(t.txn_time, 1, 7) = '2026-07'`
    )
    .get(samUserId) as { amt: number; cnt: number; merchants: number };
}

function dashboardJuly(samUserId: number) {
  return getDashboardMonthlyStats(samUserId, "leader").find((s) => s.month === 7);
}

function seedUsers() {
  db.prepare(
    `INSERT INTO users (username, password_hash, display_name, role) VALUES ('admin', 'x', 'admin', 'admin')`
  ).run();
  const samId = Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, display_name, role) VALUES ('sam202512', 'x', 'Sam', 'leader')`
      )
      .run().lastInsertRowid
  );
  for (const u of ["Winnie202512", "Alex202604", "Ivy202604", "Char202605", "Khloe202606", "JT2026"]) {
    db.prepare(
      `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, 'x', ?, 'sales')`
    ).run(u, u.replace(/\d.*/, "") || u);
  }
  return samId;
}

function printStep(label: string, samId: number) {
  const dbRow = samJulyStats(samId);
  const dash = dashboardJuly(samId);
  console.log(`\n── ${label} ──`);
  console.log(
    `  DB 7月 sam202512: ${fmt(dbRow.amt)} / ${dbRow.cnt} 笔 / ${dbRow.merchants} 商户`
  );
  if (dash) {
    console.log(
      `  看板 7月:         ${fmt(dash.totalAmount)} / ${dash.txnCount} 笔 / ${dash.merchantCount} 商户`
    );
  }
}

function importFile(
  filePath: string,
  mode: "append" | "replace" = "append",
  salesOverride?: string
) {
  const buf = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  const r = importTransactionFile(buf, name, 1, mode, salesOverride);
  console.log(
    `  导入 ${name}: 新增 ${r.imported}, 跳过 ${(r as { skipped?: number }).skipped ?? 0}`
  );
  return r;
}

function corruptHalfSamMerchants(samId: number, winnieId: number) {
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
  for (const m of half) {
    upd.run(winnieId, "Winnie202512", m.id);
  }
  console.log(`  已将 ${half.length}/${merchants.length} 家 7 月商户错误挂到 Winnie202512`);
}

initSchema();
const samId = seedUsers();

if (scenario === "A") {
  console.log("=".repeat(60));
  console.log("沙箱 A：正常流程（sam xlsx → org 7/1）");
  console.log("=".repeat(60));
  importFile(SAM_XLSX, "append", "sam202512");
  printStep("仅 sam202512.xlsx 后", samId);
  importFile(ORG_XLSX, "append");
  printStep("再追加 org 7/1（全重复跳过）后", samId);
  syncMerchantSalesAssignment();
  printStep("同步商户归属后", samId);
} else if (scenario === "B") {
  console.log("=".repeat(60));
  console.log("沙箱 B：模拟归属错误（一半商户挂到 Winnie）");
  console.log("=".repeat(60));
  const winnieId = (
    db.prepare(`SELECT id FROM users WHERE username = 'Winnie202512'`).get() as { id: number }
  ).id;
  importFile(SAM_XLSX, "append", "sam202512");
  corruptHalfSamMerchants(samId, winnieId);
  printStep("归属被破坏后", samId);
  importFile(ORG_XLSX, "append");
  printStep("追加 org 7/1 后", samId);
  syncMerchantSalesAssignment();
  printStep("同步商户归属后", samId);
} else if (scenario === "C") {
  console.log("=".repeat(60));
  console.log("沙箱 C：用户截图（sam xlsx 再导 → 7606 全跳过）");
  console.log("=".repeat(60));
  importFile(SAM_XLSX, "append", "sam202512");
  const r2 = importFile(SAM_XLSX, "append", "sam202512");
  printStep("第二次 sam xlsx", samId);
  if (r2.imported === 0 && ((r2 as { skipped?: number }).skipped ?? 0) > 7000) {
    console.log("  ✓ 已复现「7606 重复跳过」");
  }
  importFile(ORG_XLSX, "append");
  syncMerchantSalesAssignment();
  printStep("org 7/1 + 同步后", samId);
}
