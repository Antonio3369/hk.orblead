import { db, runTransaction } from "./db.js";
import { parseMerchantLimitFile, type LimitKind, type MerchantLimitRow } from "./merchantLimitsParser.js";

const SCAN_FILENAME_RE = /扫码|掃碼|scan/i;

/** 依檔名判斷是否為掃碼額度表，避免誤傳到刷卡導入而覆蓋刷卡單月額度 */
export function validateLimitImportFilename(filename: string, limitKind: LimitKind): string | null {
  const name = filename.trim();
  const looksLikeScan = SCAN_FILENAME_RE.test(name);

  if (limitKind === "card" && looksLikeScan) {
    return `「${name}」為掃碼額度表（檔名含「扫码/掃碼」），請改用「上傳掃碼額度表」。誤傳到刷卡會把單月限額寫入刷卡欄位，導致顯示與後台表格不一致。`;
  }
  if (limitKind === "scan" && !looksLikeScan) {
    return `「${name}」檔名未含「扫码/掃碼」，疑似刷卡額度表，請改用「上傳刷卡額度表」。`;
  }
  return null;
}

/** 同一檔案內重複商戶編號只保留最後一行，避免重複寫入 */
function dedupeLimitRows(rows: MerchantLimitRow[]): { rows: MerchantLimitRow[]; duplicates: number } {
  const map = new Map<string, MerchantLimitRow>();
  for (const row of rows) {
    map.set(row.merchantCode, row);
  }
  return { rows: [...map.values()], duplicates: rows.length - map.size };
}

export function importMerchantLimitFile(
  buffer: Buffer,
  filename: string,
  importedBy: number,
  limitKind: LimitKind
): {
  ok: boolean;
  imported: number;
  updated: number;
  skipped: number;
  duplicates: number;
  merchantsLinked: number;
  errors: string[];
} {
  const filenameError = validateLimitImportFilename(filename, limitKind);
  if (filenameError) {
    return {
      ok: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      duplicates: 0,
      merchantsLinked: 0,
      errors: [filenameError],
    };
  }

  const parsed = parseMerchantLimitFile(buffer, filename, limitKind);
  const { rows: deduped, duplicates } = dedupeLimitRows(parsed.rows);
  const errors = [...parsed.errors];
  if (duplicates > 0) {
    errors.push(`檔案內 ${duplicates} 行商戶編號重複，已按最後一行覆蓋`);
  }
  const rows = deduped;

  if (rows.length === 0) {
    return {
      ok: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      duplicates: 0,
      merchantsLinked: 0,
      errors: errors.length ? errors : ["未解析到有效額度行"],
    };
  }

  const batch = db
    .prepare(`INSERT INTO limit_import_batches (filename, row_count, imported_by) VALUES (?, ?, ?)`)
    .run(filename, rows.length, importedBy);

  // 按商戶編號覆蓋同類型額度，不累加；刷卡/掃碼分開更新，互不覆蓋
  const upsertCard = db.prepare(`
    INSERT INTO merchant_channel_limits (
      merchant_code, card_limit, card_single_limit, card_daily_limit, batch_id, updated_at
    )
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(merchant_code) DO UPDATE SET
      card_limit = excluded.card_limit,
      card_single_limit = excluded.card_single_limit,
      card_daily_limit = excluded.card_daily_limit,
      batch_id = excluded.batch_id,
      updated_at = datetime('now')
  `);

  const upsertScan = db.prepare(`
    INSERT INTO merchant_channel_limits (
      merchant_code, scan_limit, scan_single_limit, scan_daily_limit, batch_id, updated_at
    )
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(merchant_code) DO UPDATE SET
      scan_limit = excluded.scan_limit,
      scan_single_limit = excluded.scan_single_limit,
      scan_daily_limit = excluded.scan_daily_limit,
      batch_id = excluded.batch_id,
      updated_at = datetime('now')
  `);

  let imported = 0;
  let updated = 0;
  let merchantsLinked = 0;
  const batchId = Number(batch.lastInsertRowid);

  const linkMerchantCode = db.prepare(`
    UPDATE merchants SET merchant_code = ?
    WHERE id = ?
      AND (merchant_code IS NULL OR TRIM(merchant_code) = '')
  `);

  runTransaction(() => {
    for (const row of rows) {
      const existing = db
        .prepare(`SELECT merchant_code FROM merchant_channel_limits WHERE merchant_code = ?`)
        .get(row.merchantCode);
      if (limitKind === "card") {
        upsertCard.run(row.merchantCode, row.cardMonthly, row.cardSingle, row.cardDaily, batchId);
      } else {
        upsertScan.run(row.merchantCode, row.scanMonthly, row.scanSingle, row.scanDaily, batchId);
      }
      if (existing) updated++;
      else imported++;

      const names = [row.merchantShortName, row.merchantName].filter(Boolean) as string[];
      for (const name of names) {
        const merchants = db
          .prepare(`SELECT id FROM merchants WHERE TRIM(name) = TRIM(?)`)
          .all(name) as { id: number }[];
        for (const m of merchants) {
          const r = linkMerchantCode.run(row.merchantCode, m.id);
          if (r.changes > 0) merchantsLinked++;
        }
      }
    }
  });

  return {
    ok: true,
    imported,
    updated,
    skipped: errors.length,
    duplicates,
    merchantsLinked,
    errors,
  };
}

export function getMerchantLimitStats(): {
  merchantCount: number;
  cardLimitCount: number;
  scanLimitCount: number;
  lastImportedAt: string | null;
} {
  const count = db.prepare(`SELECT COUNT(*) as c FROM merchant_channel_limits`).get() as { c: number };
  const cardLimitCount = db
    .prepare(`SELECT COUNT(*) as c FROM merchant_channel_limits WHERE card_limit IS NOT NULL AND card_limit > 0`)
    .get() as { c: number };
  const scanLimitCount = db
    .prepare(`SELECT COUNT(*) as c FROM merchant_channel_limits WHERE scan_limit IS NOT NULL AND scan_limit > 0`)
    .get() as { c: number };
  const last = db
    .prepare(`SELECT MAX(updated_at) as t FROM merchant_channel_limits`)
    .get() as { t: string | null };
  return {
    merchantCount: count.c,
    cardLimitCount: cardLimitCount.c,
    scanLimitCount: scanLimitCount.c,
    lastImportedAt: last.t,
  };
}
