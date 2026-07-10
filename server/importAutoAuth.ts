import type { Request, Response, NextFunction } from "express";
import { db } from "./db.js";

export function importKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.IMPORT_API_KEY?.trim();
  if (!expected) {
    res.status(503).json({ error: "自動導入未配置（缺少 IMPORT_API_KEY）" });
    return;
  }
  const provided = req.header("x-import-key")?.trim();
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Import key 無效" });
    return;
  }
  next();
}

export function getAutoImportAdminId(): number {
  const row = db.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).get() as
    | { id: number }
    | undefined;
  if (!row) throw new Error("未找到 admin 帳號");
  return row.id;
}

/** 移卡每日机构报表附件名前缀 */
export const YIKA_ORG_REPORT_PREFIX = "54516685_機构交易數據報表";

export function isYikaOrgReportFilename(filename: string): boolean {
  return filename.startsWith(YIKA_ORG_REPORT_PREFIX) && /\.xlsx?$/i.test(filename);
}
