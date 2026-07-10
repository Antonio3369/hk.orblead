import { db } from "./db.js";

/** 按商户 sales_name 与销售的 display_name / username 匹配，写入 sales_user_id */
export function syncMerchantSalesAssignment(): { updated: number; matchedMerchants: number } {
  const before = db
    .prepare(`SELECT COUNT(*) as c FROM merchants WHERE sales_user_id IS NOT NULL`)
    .get() as { c: number };

  db.prepare(`
    UPDATE merchants
    SET sales_user_id = (
      SELECT u.id FROM users u
      WHERE u.role IN ('sales', 'leader')
        AND COALESCE(u.enabled, 1) = 1
        AND (
          LOWER(TRIM(u.display_name)) = LOWER(TRIM(merchants.sales_name))
          OR LOWER(TRIM(u.username)) = LOWER(TRIM(merchants.sales_name))
          OR (
            LENGTH(TRIM(merchants.sales_name)) >= 2
            AND LOWER(u.username) LIKE LOWER(TRIM(merchants.sales_name)) || '%'
            AND substr(u.username, length(trim(merchants.sales_name)) + 1, 1) BETWEEN '0' AND '9'
          )
        )
      LIMIT 1
    )
    WHERE TRIM(COALESCE(sales_name, '')) != ''
  `).run();

  const after = db
    .prepare(`SELECT COUNT(*) as c FROM merchants WHERE sales_user_id IS NOT NULL`)
    .get() as { c: number };

  const matchedMerchants = db
    .prepare(
      `SELECT COUNT(DISTINCT sales_name) as c FROM merchants
       WHERE TRIM(COALESCE(sales_name, '')) != '' AND sales_user_id IS NOT NULL`
    )
    .get() as { c: number };

  return { updated: after.c - before.c, matchedMerchants: matchedMerchants.c };
}

/** 为某次导入批次中未归属销售的商户补写 sales_name 并同步账号 */
export function assignSalesToImportBatch(
  batchId: number,
  salesName: string
): { merchantsUpdated: number; synced: number } {
  const sn = salesName.trim();
  if (!sn) return { merchantsUpdated: 0, synced: 0 };

  const r = db
    .prepare(
      `UPDATE merchants SET sales_name = ?
       WHERE TRIM(COALESCE(sales_name, '')) = ''
         AND id IN (
           SELECT DISTINCT merchant_id FROM transactions WHERE batch_id = ?
           UNION
           SELECT DISTINCT merchant_id FROM card_failure_events WHERE batch_id = ?
         )`
    )
    .run(sn, batchId, batchId);

  const { updated } = syncMerchantSalesAssignment();
  return { merchantsUpdated: Number(r.changes), synced: updated };
}

/** 有 sales_name 但未关联销售账号的商户，按销售名汇总 */
export function getUnmatchedSalesNames(): { salesName: string; merchantCount: number }[] {
  return db
    .prepare(
      `SELECT TRIM(sales_name) as salesName, COUNT(*) as merchantCount
       FROM merchants
       WHERE TRIM(COALESCE(sales_name, '')) != '' AND sales_user_id IS NULL
       GROUP BY TRIM(sales_name)
       ORDER BY merchantCount DESC`
    )
    .all() as { salesName: string; merchantCount: number }[];
}
