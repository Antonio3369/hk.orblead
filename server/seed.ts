import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "./auth.js";
import { initSchema, db } from "./db.js";
import { importTransactionFile } from "./importService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seed() {
  initSchema();

  const users = [
    { username: "admin", password: "admin123", display_name: "管理员", role: "admin" },
    { username: "sam", password: "sales123", display_name: "Sam", role: "sales" },
    { username: "winnie", password: "sales123", display_name: "Winnie", role: "sales" },
    { username: "zhangming", password: "sales123", display_name: "张明", role: "sales" },
    { username: "lifang", password: "sales123", display_name: "李芳", role: "sales" },
  ];

  for (const u of users) {
    const exists = db.prepare(`SELECT id FROM users WHERE username = ?`).get(u.username);
    if (!exists) {
      const hash = await hashPassword(u.password);
      db.prepare(
        `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`
      ).run(u.username, hash, u.display_name, u.role);
      console.log(`Created user: ${u.username}`);
    }
  }

  const txnCount = db.prepare(`SELECT COUNT(*) as c FROM transactions`).get() as { c: number };
  const samplePath = path.join(__dirname, "..", "public", "samples", "transactions.csv");
  if (txnCount.c === 0 && fs.existsSync(samplePath)) {
    const buf = fs.readFileSync(samplePath);
    const admin = db.prepare(`SELECT id FROM users WHERE username = 'admin'`).get() as {
      id: number;
    };
    const result = importTransactionFile(buf, "transactions.csv", admin.id, "replace");
    console.log("Sample import:", result);
  }

  console.log("\n默认账号：");
  console.log("  管理员  admin / admin123  （可上传数据、改预警规则）");
  console.log("  销售    sam / sales123");
  console.log("  销售    winnie / sales123");
  console.log("  销售    zhangming / sales123");
  console.log("  销售    lifang / sales123");
}

seed().catch(console.error);
