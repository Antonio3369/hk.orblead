/**
 * 用真实机构报表在 app.db 副本上做 append 导入验证
 *
 * 用法：
 *   JWT_SECRET=... npx tsx tools/verify-org-import-sandbox.ts [xlsx路径]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const orgXlsx =
  process.argv[2] ??
  "/Users/antonio/Downloads/54516685_機构交易數據報表_2026-07-08.xlsx";
const srcDb = path.join(root, "data", "app.db");
const testDb = path.join(root, "data", "sandbox-import-test.db");

if (!fs.existsSync(orgXlsx)) {
  console.error(`缺少机构报表: ${orgXlsx}`);
  process.exit(1);
}
if (!fs.existsSync(srcDb)) {
  console.error(`缺少源库: ${srcDb}`);
  process.exit(1);
}

for (const ext of ["", "-wal", "-shm"]) {
  const from = srcDb + ext;
  const to = testDb + ext;
  if (fs.existsSync(from)) fs.copyFileSync(from, to);
  else if (fs.existsSync(to)) fs.unlinkSync(to);
}

process.env.DATABASE_PATH = testDb;

const warnings: string[] = [];
const origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  warnings.push(line);
  origWarn(...args);
};

const DUP_CODES = ["2492609650", "4490195739", "5739822576"];

function sumSamJuly(db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } }) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(t.amount),0) amt, COUNT(*) cnt, COUNT(DISTINCT m.id) mc
       FROM transactions t
       JOIN merchants m ON m.id = t.merchant_id
       JOIN users u ON u.id = m.sales_user_id
       WHERE u.username = 'sam202512' AND substr(t.txn_time,1,7) = '2026-07'`
    )
    .get() as { amt: number; cnt: number; mc: number };
}

function dupCodeSnapshot(db: {
  prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] };
}) {
  return db
    .prepare(
      `SELECT m.id, m.name, m.merchant_code, COUNT(t.id) txn
       FROM merchants m
       LEFT JOIN transactions t ON t.merchant_id = m.id
       WHERE TRIM(m.merchant_code) IN (${DUP_CODES.map(() => "?").join(",")})
       GROUP BY m.id
       ORDER BY m.merchant_code, m.id`
    )
    .all(...DUP_CODES) as { id: number; name: string; merchant_code: string; txn: number }[];
}

async function main() {
  const { initSchema, db } = await import("../server/db.js");
  const { importTransactionFile } = await import("../server/importService.js");

  initSchema();

  const beforeSam = sumSamJuly(db);
  const beforeDup = dupCodeSnapshot(db);
  const beforeMerchants = (db.prepare(`SELECT COUNT(*) c FROM merchants`).get() as { c: number }).c;
  const beforeTxns = (db.prepare(`SELECT COUNT(*) c FROM transactions`).get() as { c: number }).c;

  const buf = fs.readFileSync(orgXlsx);
  const result = importTransactionFile(
    buf,
    path.basename(orgXlsx),
    1,
    "append"
  );

  const afterSam = sumSamJuly(db);
  const afterDup = dupCodeSnapshot(db);
  const afterMerchants = (db.prepare(`SELECT COUNT(*) c FROM merchants`).get() as { c: number }).c;
  const afterTxns = (db.prepare(`SELECT COUNT(*) c FROM transactions`).get() as { c: number }).c;

  const importWarnings = warnings.filter((w) => w.includes("[import]"));

  console.log("\n=== 机构报表沙箱导入验证 ===");
  console.log(`文件: ${orgXlsx}`);
  console.log(`测试库: ${testDb}（自 app.db 复制，不影响生产库）`);
  console.log(`导入结果: ${result.ok ? "成功" : "失败"}`);
  if (!result.ok) {
    console.log(result.errors);
    process.exit(1);
  }
  console.log(`消息: 新增成功 ${result.imported}，跳过重复 ${result.skipped ?? 0}`);
  if (result.errors?.length) {
    console.log("提示:", result.errors.slice(0, 5).join(" | "));
  }

  console.log("\n--- 全库 ---");
  console.log(`商户: ${beforeMerchants} → ${afterMerchants} (+${afterMerchants - beforeMerchants})`);
  console.log(`交易: ${beforeTxns} → ${afterTxns} (+${afterTxns - beforeTxns})`);

  console.log("\n--- sam202512 2026-07 ---");
  console.log(
    `交易额 ${beforeSam.amt.toLocaleString()} → ${afterSam.amt.toLocaleString()} (+${(afterSam.amt - beforeSam.amt).toLocaleString()})`
  );
  console.log(`笔数 ${beforeSam.cnt} → ${afterSam.cnt} (+${afterSam.cnt - beforeSam.cnt})`);
  console.log(`商户数 ${beforeSam.mc} → ${afterSam.mc} (+${afterSam.mc - beforeSam.mc})`);

  console.log("\n--- 重复编号商户（导入前后交易笔数）---");
  for (const code of DUP_CODES) {
    const b = beforeDup.filter((r) => r.merchant_code === code);
    const a = afterDup.filter((r) => r.merchant_code === code);
    console.log(`编号 ${code}:`);
    for (const row of a) {
      const prev = b.find((x) => x.id === row.id);
      const delta = row.txn - (prev?.txn ?? 0);
      console.log(`  id=${row.id} ${row.name}: ${prev?.txn ?? 0} → ${row.txn} (+${delta})`);
    }
  }

  if (importWarnings.length) {
    console.log(`\n--- 导入告警 (${importWarnings.length}) ---`);
    for (const w of importWarnings) console.log(w);
  } else {
    console.log("\n--- 导入告警: 无（本批未触发同编号冲突）---");
  }

  console.log("\n✅ 真实机构报表 append 导入完成，请核对上方重复编号分流是否合理。");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
