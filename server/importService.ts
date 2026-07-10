import { db, runTransaction } from "./db.js";
import { recomputeAllAlerts } from "./alertsEngine.js";
import { repairAckAlertsFromFollowUps } from "./followUp.js";
import { parseTransactionFile, type RawTransactionRow } from "./importParser.js";
import { classifyPaymentChannel } from "./paymentChannel.js";
import { repairFailureMerchantSales } from "./repairFailureSales.js";
import { syncMerchantSalesAssignment } from "./userSync.js";

/** 单次导入内去重，避免同编号重复刷告警 */
const duplicateCodeWarnings = new Set<string>();
const codeConflictWarnings = new Set<string>();

function clearImportMerchantWarnings() {
  duplicateCodeWarnings.clear();
  codeConflictWarnings.clear();
}

function normalizeMerchantCode(code?: string): string | null {
  const trimmed = code?.trim();
  return trimmed ? trimmed : null;
}

function warnDuplicateMerchantCode(
  merchantCode: string,
  rows: { id: number; name: string }[]
): void {
  if (duplicateCodeWarnings.has(merchantCode)) return;
  duplicateCodeWarnings.add(merchantCode);
  const ids = rows.map((r) => r.id).join(", ");
  const names = rows.map((r) => r.name).join(" | ");
  console.warn(
    `[import] 商户编号 ${merchantCode} 对应 ${rows.length} 条商户记录 (ids=${ids}; names=${names})，已尝试按名称/销售兜底`
  );
}

function warnMerchantCodeConflict(
  merchantId: number,
  existingCode: string,
  incomingCode: string,
  merchantName: string
): void {
  const key = `${merchantId}:${existingCode}:${incomingCode}`;
  if (codeConflictWarnings.has(key)) return;
  codeConflictWarnings.add(key);
  console.warn(
    `[import] 商户「${merchantName}」(id=${merchantId}) 已有编号 ${existingCode}，导入行编号为 ${incomingCode}，未覆盖`
  );
}

function resolveSalesUserId(salesName: string): number | null {
  if (!salesName) return null;
  const user = db
    .prepare(
      `SELECT id FROM users WHERE role IN ('sales', 'leader') AND COALESCE(enabled, 1) = 1
       AND (LOWER(display_name) = LOWER(?) OR LOWER(username) = LOWER(?))
       LIMIT 1`
    )
    .get(salesName, salesName) as { id: number } | undefined;
  return user?.id ?? null;
}

type MerchantLookupRow = { id: number; name: string; sales_name: string | null };

function findMerchantIdByCode(
  merchantCode: string,
  merchantName: string,
  salesName: string
): { id: number } | undefined {
  const rows = db
    .prepare(
      `SELECT id, name, sales_name FROM merchants
       WHERE merchant_code IS NOT NULL AND TRIM(merchant_code) = ?`
    )
    .all(merchantCode) as MerchantLookupRow[];
  if (rows.length === 0) return undefined;
  if (rows.length === 1) return { id: rows[0].id };

  warnDuplicateMerchantCode(merchantCode, rows);

  const sn = salesName.trim();
  const exactNameAndSales = rows.find(
    (r) =>
      r.name === merchantName &&
      (!sn || (r.sales_name || "").trim() === sn || !(r.sales_name || "").trim())
  );
  if (exactNameAndSales) return { id: exactNameAndSales.id };

  const nameMatches = rows.filter((r) => r.name === merchantName);
  if (nameMatches.length === 1) return { id: nameMatches[0].id };
  if (nameMatches.length > 1 && sn) {
    const bySales = nameMatches.find((r) => (r.sales_name || "").trim() === sn);
    if (bySales) return { id: bySales.id };
  }

  return { id: rows[0].id };
}

function findMerchantIdByName(merchantName: string, salesName: string): { id: number } | undefined {
  const exact = db
    .prepare(
      `SELECT id FROM merchants WHERE name = ? AND COALESCE(sales_name, '') = COALESCE(?, '') LIMIT 1`
    )
    .get(merchantName, salesName || "") as { id: number } | undefined;
  if (exact) return exact;

  const candidates = db
    .prepare(`SELECT id, sales_name FROM merchants WHERE name = ?`)
    .all(merchantName) as { id: number; sales_name: string | null }[];
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return { id: candidates[0].id };

  const sn = salesName.trim();
  if (sn) {
    const bySales = candidates.find((c) => (c.sales_name || "").trim() === sn);
    if (bySales) return { id: bySales.id };
  }
  const withSales = candidates.find((c) => (c.sales_name || "").trim() !== "");
  if (withSales) return { id: withSales.id };

  return { id: candidates[0].id };
}

function findMerchantId(
  merchantName: string,
  salesName: string,
  merchantCode?: string
): { id: number; matchedBy: "code" | "name" } | undefined {
  const code = normalizeMerchantCode(merchantCode);
  if (code) {
    const byCode = findMerchantIdByCode(code, merchantName, salesName);
    if (byCode) return { id: byCode.id, matchedBy: "code" };
  }
  const byName = findMerchantIdByName(merchantName, salesName);
  if (byName) return { id: byName.id, matchedBy: "name" };
  return undefined;
}

function upsertMerchant(row: {
  merchantName: string;
  merchantCode?: string;
  salesName: string;
}): number {
  const salesUserId = resolveSalesUserId(row.salesName);
  const incomingCode = normalizeMerchantCode(row.merchantCode);
  const existing = findMerchantId(row.merchantName, row.salesName || "", incomingCode ?? undefined);

  if (existing) {
    if (salesUserId) {
      db.prepare(`UPDATE merchants SET sales_user_id = ?, sales_name = ? WHERE id = ?`).run(
        salesUserId,
        row.salesName,
        existing.id
      );
    } else if (row.salesName) {
      db.prepare(`UPDATE merchants SET sales_name = ? WHERE id = ? AND COALESCE(sales_name, '') = ''`).run(
        row.salesName,
        existing.id
      );
    }
    if (incomingCode) {
      const stored = db
        .prepare(`SELECT merchant_code FROM merchants WHERE id = ?`)
        .get(existing.id) as { merchant_code: string | null } | undefined;
      const currentCode = (stored?.merchant_code || "").trim();
      if (!currentCode) {
        db.prepare(`UPDATE merchants SET merchant_code = ? WHERE id = ?`).run(incomingCode, existing.id);
      } else if (currentCode !== incomingCode) {
        warnMerchantCodeConflict(existing.id, currentCode, incomingCode, row.merchantName);
      }
    }
    return existing.id;
  }

  const result = db
    .prepare(`INSERT INTO merchants (name, sales_user_id, sales_name, merchant_code) VALUES (?, ?, ?, ?)`)
    .run(row.merchantName, salesUserId, row.salesName || null, incomingCode);
  return Number(result.lastInsertRowid);
}

/** 只補錄交易失敗單，不重複寫入成功交易 */
export function importFailureEventsOnly(
  buffer: Buffer,
  filename: string,
  importedBy: number,
  salesOverride?: string
) {
  const { failureRows, errors } = parseTransactionFile(buffer, filename, { salesOverride });
  if (failureRows.length === 0) {
    return {
      ok: false as const,
      errors: [...errors, "未解析到交易失敗訂單（請確認文件含「狀態」非「成功」的記錄）"],
      imported: 0,
      failuresImported: 0,
    };
  }

  clearImportMerchantWarnings();

  const batch = db
    .prepare(`INSERT INTO import_batches (filename, row_count, imported_by) VALUES (?, ?, ?)`)
    .run(`[失敗補錄] ${filename}`, failureRows.length, importedBy);
  const batchId = Number(batch.lastInsertRowid);

  const insertFailure = db.prepare(`
    INSERT OR IGNORE INTO card_failure_events
    (merchant_id, txn_name, txn_time, amount, status, card_region, order_no, detail, batch_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let failuresImported = 0;
  let failuresSkipped = 0;
  runTransaction(() => {
    for (const row of failureRows) {
      const merchantId = upsertMerchant(row);
      const r = insertFailure.run(
        merchantId,
        row.txnName,
        row.txnTime,
        row.amount,
        row.status,
        row.cardRegion || null,
        row.orderNo || null,
        row.detail || null,
        batchId
      );
      if (r.changes > 0) failuresImported++;
      else failuresSkipped++;
    }
  });

  repairFailureMerchantSales();
  syncMerchantSalesAssignment();

  return {
    ok: true as const,
    imported: 0,
    failuresImported,
    failuresSkipped,
    parsedFailures: failureRows.length,
    merchants: 0,
    errors: [...errors, `已補錄 ${failuresImported} 條交易失敗（解析 ${failureRows.length} 條）`],
    batchId,
  };
}

export function importTransactionFile(
  buffer: Buffer,
  filename: string,
  importedBy: number,
  mode: "replace" | "append" = "append",
  salesOverride?: string
) {
  const { rows, failureRows, errors } = parseTransactionFile(buffer, filename, { salesOverride });
  if (rows.length === 0 && failureRows.length === 0) {
    return { ok: false as const, errors, imported: 0, failuresImported: 0 };
  }

  if (mode === "replace") {
    db.prepare("DELETE FROM transactions").run();
    db.prepare("DELETE FROM card_failure_events").run();
    db.prepare("DELETE FROM merchants").run();
    db.prepare("DELETE FROM alerts").run();
  }

  clearImportMerchantWarnings();

  const batch = db
    .prepare(`INSERT INTO import_batches (filename, row_count, imported_by) VALUES (?, ?, ?)`)
    .run(filename, rows.length + failureRows.length, importedBy);
  const batchId = Number(batch.lastInsertRowid);

  const insertTxn = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (merchant_id, txn_name, txn_time, amount, detail, order_no, batch_id, pay_wallet, payment_channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFailure = db.prepare(`
    INSERT OR IGNORE INTO card_failure_events
    (merchant_id, txn_name, txn_time, amount, status, card_region, order_no, detail, batch_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let skipped = 0;
  let failuresImported = 0;
  let failuresSkipped = 0;
  runTransaction(() => {
    for (const row of rows) {
      const merchantId = upsertMerchant(row);
      const payWallet = row.payWallet?.trim() || null;
      const paymentChannel = classifyPaymentChannel(payWallet ?? "", row.txnName);
      const r = insertTxn.run(
        merchantId,
        row.txnName,
        row.txnTime,
        row.amount,
        row.detail || null,
        row.orderNo?.trim() || null,
        batchId,
        payWallet,
        paymentChannel
      );
      if (r.changes > 0) imported++;
      else skipped++;
    }
    for (const row of failureRows) {
      const merchantId = upsertMerchant(row);
      const r = insertFailure.run(
        merchantId,
        row.txnName,
        row.txnTime,
        row.amount,
        row.status,
        row.cardRegion || null,
        row.orderNo || null,
        row.detail || null,
        batchId
      );
      if (r.changes > 0) failuresImported++;
      else failuresSkipped++;
    }
  });

  recomputeAllAlerts();
  repairAckAlertsFromFollowUps();
  repairFailureMerchantSales();
  syncMerchantSalesAssignment();

  return {
    ok: true as const,
    imported,
    skipped,
    parsedSuccess: rows.length,
    failuresImported,
    failuresSkipped,
    parsedFailures: failureRows.length,
    merchants: rows.length,
    errors,
    batchId,
  };
}

export function formatImportResultMessage(result: {
  imported?: number;
  skipped?: number;
  failuresImported?: number;
  failuresSkipped?: number;
  failuresOnly?: boolean;
}): string {
  if (result.failuresOnly) {
    const imp = result.failuresImported ?? 0;
    const skip = result.failuresSkipped ?? 0;
    return skip > 0
      ? `新增 ${imp} 筆交易失敗，${skip} 筆因重複跳過`
      : `新增 ${imp} 筆交易失敗`;
  }
  const imp = result.imported ?? 0;
  const skip = result.skipped ?? 0;
  let msg = skip > 0 ? `新增 ${imp} 筆成功交易，${skip} 筆因重複跳過` : `新增 ${imp} 筆成功交易`;
  const fImp = result.failuresImported ?? 0;
  const fSkip = result.failuresSkipped ?? 0;
  if (fImp > 0 || fSkip > 0) {
    msg +=
      fSkip > 0
        ? `；新增 ${fImp} 筆交易失敗，${fSkip} 筆因重複跳過`
        : `；新增 ${fImp} 筆交易失敗`;
  }
  return msg;
}
