import { db, runTransaction } from "./db.js";
import { recomputeAlertsForMerchants } from "./alertsEngine.js";
import { repairAckAlertsFromFollowUps } from "./followUp.js";
import { parseTransactionFile, type RawTransactionRow } from "./importParser.js";
import { classifyPaymentChannel } from "./paymentChannel.js";
import { repairFailureMerchantSales } from "./repairFailureSales.js";
import { syncMerchantSalesAssignment } from "./userSync.js";

const ORDER_NO_LOOKUP_CHUNK = 400;

function merchantRowKey(row: { merchantName: string; salesName: string }): string {
  return `${row.merchantName}|${row.salesName || ""}`;
}

/** 批量查文件内订单号是否已在库（避免逐行 SELECT，生产大库 + 慢盘时极慢） */
function preloadExistingOrderNos(orderNos: string[]): Set<string> {
  const unique = [...new Set(orderNos.map((o) => o.trim()).filter(Boolean))];
  const existing = new Set<string>();
  if (unique.length === 0) return existing;

  for (let i = 0; i < unique.length; i += ORDER_NO_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + ORDER_NO_LOOKUP_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const hits = db
      .prepare(`SELECT order_no FROM transactions WHERE order_no IN (${placeholders})`)
      .all(...chunk) as { order_no: string }[];
    for (const h of hits) {
      const trimmed = (h.order_no || "").trim();
      if (trimmed) existing.add(trimmed);
    }
  }
  return existing;
}

/** 一次 UPDATE 批量补空的卡歸屬地（替代逐单 UPDATE） */
function batchFillEmptyCardRegion(fillByOrder: Map<string, string>): number {
  if (fillByOrder.size === 0) return 0;

  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS _import_region_fill (
      order_no TEXT PRIMARY KEY,
      card_region TEXT NOT NULL
    )
  `);
  db.exec(`DELETE FROM _import_region_fill`);

  const ins = db.prepare(
    `INSERT OR REPLACE INTO _import_region_fill (order_no, card_region) VALUES (?, ?)`
  );
  for (const [orderNo, region] of fillByOrder) {
    const r = region.trim();
    if (r) ins.run(orderNo, r);
  }

  const result = db
    .prepare(
      `UPDATE transactions
       SET card_region = (
         SELECT f.card_region FROM _import_region_fill f WHERE f.order_no = transactions.order_no
       )
       WHERE order_no IN (SELECT order_no FROM _import_region_fill)
         AND (card_region IS NULL OR TRIM(card_region) = '')`
    )
    .run();
  return Number(result.changes);
}

/** 导入后有新交易时：预警重算等（可 defer 到 HTTP 响应之后） */
export function runImportPostProcessing(touchedMerchantIds: number[]) {
  const ids = [...new Set(touchedMerchantIds.filter((id) => id > 0))];
  if (ids.length === 0) return;
  recomputeAlertsForMerchants(ids);
  repairAckAlertsFromFollowUps();
  repairFailureMerchantSales();
  syncMerchantSalesAssignment();
}

/** 单次导入内去重，避免同编号重复刷告警 */
const duplicateCodeWarnings = new Set<string>();
const codeConflictWarnings = new Set<string>();

function clearImportMerchantWarnings() {
  duplicateCodeWarnings.clear();
  codeConflictWarnings.clear();
  clearImportCaches();
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

const salesUserIdCache = new Map<string, number | null>();

function clearImportCaches() {
  salesUserIdCache.clear();
  merchantUpsertCache.clear();
}

function resolveSalesUserId(salesName: string): number | null {
  if (!salesName) return null;
  const key = salesName.toLowerCase();
  if (salesUserIdCache.has(key)) return salesUserIdCache.get(key)!;
  const user = db
    .prepare(
      `SELECT id FROM users WHERE role IN ('sales', 'leader') AND COALESCE(enabled, 1) = 1
       AND (LOWER(display_name) = LOWER(?) OR LOWER(username) = LOWER(?))
       LIMIT 1`
    )
    .get(salesName, salesName) as { id: number } | undefined;
  const id = user?.id ?? null;
  salesUserIdCache.set(key, id);
  return id;
}

/** 单次导入内：同商户多行只 upsert 一次 */
const merchantUpsertCache = new Map<string, number>();

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

let stmtMerchantMeta: ReturnType<typeof db.prepare> | null = null;
let stmtUpdateMerchantSales: ReturnType<typeof db.prepare> | null = null;
let stmtUpdateMerchantSalesNameIfEmpty: ReturnType<typeof db.prepare> | null = null;
let stmtUpdateMerchantCode: ReturnType<typeof db.prepare> | null = null;
let stmtInsertMerchant: ReturnType<typeof db.prepare> | null = null;

function merchantStmts() {
  if (!stmtMerchantMeta) {
    stmtMerchantMeta = db.prepare(
      `SELECT sales_user_id as salesUserId, sales_name as salesName, merchant_code as merchantCode
       FROM merchants WHERE id = ?`
    );
    stmtUpdateMerchantSales = db.prepare(
      `UPDATE merchants SET sales_user_id = ?, sales_name = ? WHERE id = ?`
    );
    stmtUpdateMerchantSalesNameIfEmpty = db.prepare(
      `UPDATE merchants SET sales_name = ? WHERE id = ? AND COALESCE(sales_name, '') = ''`
    );
    stmtUpdateMerchantCode = db.prepare(`UPDATE merchants SET merchant_code = ? WHERE id = ?`);
    stmtInsertMerchant = db.prepare(
      `INSERT INTO merchants (name, sales_user_id, sales_name, merchant_code) VALUES (?, ?, ?, ?)`
    );
  }
  return {
    meta: stmtMerchantMeta!,
    updateSales: stmtUpdateMerchantSales!,
    updateSalesNameIfEmpty: stmtUpdateMerchantSalesNameIfEmpty!,
    updateCode: stmtUpdateMerchantCode!,
    insert: stmtInsertMerchant!,
  };
}

function upsertMerchant(row: {
  merchantName: string;
  merchantCode?: string;
  salesName: string;
}): number {
  const incomingCode = normalizeMerchantCode(row.merchantCode);
  // 不含导入行编号：同一商户多行编号不一致时仍能命中缓存（机构报表常见）
  const cacheKey = `${row.merchantName}|${row.salesName || ""}`;
  const cached = merchantUpsertCache.get(cacheKey);
  if (cached != null) return cached;

  const stmts = merchantStmts();
  const salesUserId = resolveSalesUserId(row.salesName);
  const existing = findMerchantId(row.merchantName, row.salesName || "", incomingCode ?? undefined);

  if (existing) {
    const meta = stmts.meta.get(existing.id) as
      | { salesUserId: number | null; salesName: string | null; merchantCode: string | null }
      | undefined;
    if (salesUserId) {
      const sameSales =
        meta?.salesUserId === salesUserId && (meta?.salesName || "") === (row.salesName || "");
      if (!sameSales) {
        stmts.updateSales.run(salesUserId, row.salesName, existing.id);
      }
    } else if (row.salesName && !(meta?.salesName || "").trim()) {
      stmts.updateSalesNameIfEmpty.run(row.salesName, existing.id);
    }
    if (incomingCode) {
      const currentCode = (meta?.merchantCode || "").trim();
      if (!currentCode) {
        stmts.updateCode.run(incomingCode, existing.id);
      } else if (currentCode !== incomingCode) {
        warnMerchantCodeConflict(existing.id, currentCode, incomingCode, row.merchantName);
      }
    }
    merchantUpsertCache.set(cacheKey, existing.id);
    return existing.id;
  }

  const result = stmts.insert.run(
    row.merchantName,
    salesUserId,
    row.salesName || null,
    incomingCode
  );
  const id = Number(result.lastInsertRowid);
  merchantUpsertCache.set(cacheKey, id);
  return id;
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
      (merchant_id, txn_name, txn_time, amount, detail, order_no, batch_id, pay_wallet, payment_channel, card_no, card_region)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFailure = db.prepare(`
    INSERT OR IGNORE INTO card_failure_events
    (merchant_id, txn_name, txn_time, amount, status, card_region, order_no, detail, batch_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const existingOrderNos =
    mode === "append" ? preloadExistingOrderNos(rows.map((r) => r.orderNo ?? "")) : new Set<string>();

  // 重复行跳过 upsert：仅对可能新增的行预热商户缓存
  if (mode === "append") {
    const warmMerchants = new Map<string, RawTransactionRow>();
    for (const row of rows) {
      const orderNo = row.orderNo?.trim() || null;
      if (orderNo && existingOrderNos.has(orderNo)) continue;
      const key = merchantRowKey(row);
      if (!warmMerchants.has(key)) warmMerchants.set(key, row);
    }
    for (const row of warmMerchants.values()) upsertMerchant(row);
  }

  let imported = 0;
  let skipped = 0;
  let cardRegionFilled = 0;
  let failuresImported = 0;
  let failuresSkipped = 0;
  const touchedMerchantIds = new Set<number>();
  /** order_no → card_region（同一订单多行只记一次） */
  const emptyRegionFillByOrder = new Map<string, string>();

  runTransaction(() => {
    for (const row of rows) {
      const cardRegion = row.cardRegion?.trim() || null;
      const orderNo = row.orderNo?.trim() || null;

      if (mode === "append" && orderNo && existingOrderNos.has(orderNo)) {
        skipped++;
        if (cardRegion && !emptyRegionFillByOrder.has(orderNo)) {
          emptyRegionFillByOrder.set(orderNo, cardRegion);
        }
        continue;
      }

      const merchantId = upsertMerchant(row);
      const payWallet = row.payWallet?.trim() || null;
      const paymentChannel = classifyPaymentChannel(payWallet ?? "", row.txnName);
      const r = insertTxn.run(
        merchantId,
        row.txnName,
        row.txnTime,
        row.amount,
        row.detail || null,
        orderNo,
        batchId,
        payWallet,
        paymentChannel,
        row.cardNo?.trim() || null,
        cardRegion
      );
      if (r.changes > 0) {
        imported++;
        touchedMerchantIds.add(merchantId);
      } else {
        skipped++;
        if (orderNo && cardRegion && !emptyRegionFillByOrder.has(orderNo)) {
          emptyRegionFillByOrder.set(orderNo, cardRegion);
        }
      }
    }
    cardRegionFilled = batchFillEmptyCardRegion(emptyRegionFillByOrder);
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
      if (r.changes > 0) {
        failuresImported++;
        touchedMerchantIds.add(merchantId);
      } else failuresSkipped++;
    }
  });

  const hasNewData = imported > 0 || failuresImported > 0;
  if (cardRegionFilled > 0) {
    errors.push(`已为 ${cardRegionFilled} 笔已存在订单补写空的卡歸屬地；未重算预警`);
  } else if (!hasNewData && (skipped > 0 || failuresSkipped > 0)) {
    errors.push("全部为重复记录，已跳过；未重算预警");
  }

  return {
    ok: true as const,
    imported,
    skipped,
    cardRegionFilled,
    parsedSuccess: rows.length,
    failuresImported,
    failuresSkipped,
    parsedFailures: failureRows.length,
    merchants: rows.length,
    errors,
    batchId,
    touchedMerchantIds: hasNewData ? [...touchedMerchantIds] : [],
  };
}

export function formatImportResultMessage(result: {
  imported?: number;
  skipped?: number;
  failuresImported?: number;
  failuresSkipped?: number;
  cardRegionFilled?: number;
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
  const filled = result.cardRegionFilled ?? 0;
  if (filled > 0) {
    msg += `；補寫空的卡歸屬地 ${filled} 筆`;
  }
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
