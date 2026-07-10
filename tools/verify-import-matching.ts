/**
 * 沙箱验证：商户编号优先导入匹配（Phase 1）
 *
 * 用法：npx tsx tools/verify-import-matching.ts
 */

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "verify-import-matching.db");

for (const ext of ["", "-wal", "-shm"]) {
  const f = dbPath + ext;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

process.env.DATABASE_PATH = dbPath;

const warnings: string[] = [];
const origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  warnings.push(line);
  origWarn(...args);
};

function buildOrgReportXlsx(
  rows: Array<Record<string, string | number>>
): Buffer {
  const headers = [
    "商戶簡稱",
    "商户编号",
    "創建時間",
    "總金額",
    "狀態",
    "業務員",
    "交易訂單號",
  ];
  const matrix = [
    headers,
    ...rows.map((r) =>
      headers.map((h) => {
        const key =
          h === "商戶簡稱"
            ? "merchantName"
            : h === "商户编号"
              ? "merchantCode"
              : h === "創建時間"
                ? "txnTime"
                : h === "總金額"
                  ? "amount"
                  : h === "狀態"
                    ? "status"
                    : h === "業務員"
                      ? "salesName"
                      : "orderNo";
        return r[key] ?? "";
      })
    ),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const { initSchema, db } = await import("../server/db.js");
  const { importTransactionFile } = await import("../server/importService.js");
  const { hashPassword } = await import("../server/auth.js");

  initSchema();
  const hash = await hashPassword("admin123");
  db.prepare(
    `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`
  ).run("admin", hash, "管理员", "admin");
  db.prepare(
    `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`
  ).run("sam202512", hash, "Sam", "sales");

  // 模拟库内 3 组重复编号之一：同编号两条商户
  db.prepare(
    `INSERT INTO merchants (name, sales_user_id, sales_name, merchant_code) VALUES (?, ?, ?, ?)`
  ).run("安寶醫務中心", 2, "sam202512", "4490195739");
  db.prepare(
    `INSERT INTO merchants (name, sales_user_id, sales_name, merchant_code) VALUES (?, ?, ?, ?)`
  ).run("安寶醫務中心（旺角）", 2, "sam202512", "4490195739");

  const m1 = (
    db.prepare(`SELECT id FROM merchants WHERE name = ?`).get("安寶醫務中心") as { id: number }
  ).id;
  const m2 = (
    db.prepare(`SELECT id FROM merchants WHERE name = ?`).get("安寶醫務中心（旺角）") as { id: number }
  ).id;

  const buf = buildOrgReportXlsx([
    {
      merchantName: "安寶醫務中心（旺角）",
      merchantCode: "4490195739",
      txnTime: "2026-07-08 10:00:00",
      amount: 100,
      status: "成功",
      salesName: "sam202512",
      orderNo: "VERIFY-ORDER-001",
    },
    {
      merchantName: "全新測試商戶",
      merchantCode: "9999999999",
      txnTime: "2026-07-08 11:00:00",
      amount: 200,
      status: "成功",
      salesName: "sam202512",
      orderNo: "VERIFY-ORDER-002",
    },
    {
      merchantName: "安寶醫務中心",
      merchantCode: "1111111111",
      txnTime: "2026-07-08 12:00:00",
      amount: 50,
      status: "成功",
      salesName: "sam202512",
      orderNo: "VERIFY-ORDER-003",
    },
  ]);

  const result = importTransactionFile(buf, "verify-org-report.xlsx", 1, "append");
  assert(result.ok, `导入失败: ${result.errors?.join("; ")}`);

  const txn1 = db
    .prepare(`SELECT COUNT(*) c FROM transactions WHERE merchant_id = ? AND order_no = ?`)
    .get(m1, "VERIFY-ORDER-003") as { c: number };
  const txn2 = db
    .prepare(`SELECT COUNT(*) c FROM transactions WHERE merchant_id = ? AND order_no = ?`)
    .get(m2, "VERIFY-ORDER-001") as { c: number };
  const txnNew = db
    .prepare(
      `SELECT m.id, m.merchant_code FROM merchants m
       JOIN transactions t ON t.merchant_id = m.id
       WHERE t.order_no = ?`
    )
    .get("VERIFY-ORDER-002") as { id: number; merchant_code: string };

  assert(txn2.c === 1, "编号 4490195739 + 名称「旺角」应落到 id=" + m2);
  assert(txn1.c === 1, "名称「安寶醫務中心」应按名称命中 id=" + m1 + "（编号冲突不覆盖）");
  assert(txnNew?.merchant_code === "9999999999", "新商户应按编号创建");

  const dupWarn = warnings.some((w) => w.includes("4490195739") && w.includes("对应"));
  const conflictWarn = warnings.some(
    (w) => w.includes("已有编号") && w.includes("1111111111")
  );
  assert(dupWarn, "应出现同编号多条商户告警");
  assert(conflictWarn, "应出现编号冲突不覆盖告警");

  const merchantCount = (db.prepare(`SELECT COUNT(*) c FROM merchants`).get() as { c: number }).c;
  assert(merchantCount === 3, `商户总数应为 3，实际 ${merchantCount}`);

  console.log("\n✅ 沙箱导入匹配验证通过");
  console.log("  - 同编号多条：按名称兜底到「旺角」商户");
  console.log("  - 名称命中但编号冲突：保留原编号，打告警");
  console.log("  - 新编号：新建商户并写入交易");
  console.log(`  - 告警条数: ${warnings.length}`);
  for (const w of warnings) console.log(`    ${w}`);
  console.log(`\n临时库: ${dbPath}（可删除）`);
}

main().catch((e) => {
  console.error("\n❌", e instanceof Error ? e.message : e);
  if (warnings.length) {
    console.error("捕获告警:");
    for (const w of warnings) console.error(`  ${w}`);
  }
  process.exit(1);
});
