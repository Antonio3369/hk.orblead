/**
 * 本地沙箱：复现 sam202512 看板与 Excel 差异，并验证修复步骤。
 *
 * 用法（项目根目录）：
 *   npx tsx tools/sandbox-sales-gap.ts
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const worker = path.join(__dirname, "sandbox-sales-gap-worker.ts");

const SAM_XLSX = process.env.SAM_XLSX ?? path.join(root, "numbers", "sam202512.xlsx");
const ORG_XLSX =
  process.env.ORG_XLSX ??
  path.join(root, "numbers", "54516685_機构交易數據報表_2026-07-08.xlsx");

for (const p of [SAM_XLSX, ORG_XLSX]) {
  if (!fs.existsSync(p)) {
    console.error(`缺少数据文件: ${p}`);
    process.exit(1);
  }
}

const dataDir = path.join(root, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const scenarios = ["A", "B", "C"] as const;

console.log("Excel 预期 sam202512 7 月: 526,287 HKD / 306 笔 / 31 商户");
console.log("看板异常参考: 247,300 HKD / 252 笔 / 22 商户\n");

for (const id of scenarios) {
  const dbPath = path.join(dataDir, `sandbox-sales-gap-${id}.db`);
  for (const ext of ["", "-wal", "-shm"]) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  execFileSync(process.execPath, ["--import", "tsx", worker, id], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_PATH: dbPath,
      SAM_XLSX,
      ORG_XLSX,
    },
  });
}

console.log("\n沙箱数据库保存在 data/sandbox-sales-gap-{A,B,C}.db");
