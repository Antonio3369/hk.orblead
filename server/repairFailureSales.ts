/** 将失败单挂到同名且已有销售名的商户，并补全销售名 */
import { db } from "./db.js";
import { extractSalesFromFilename } from "./salesFromFilename.js";

export function repairFailureMerchantSales(): { relinked: number; salesNamed: number } {
  const orphans = db
    .prepare(
      `SELECT f.id as fail_id, f.merchant_id, m.name
       FROM card_failure_events f
       JOIN merchants m ON m.id = f.merchant_id
       WHERE COALESCE(m.sales_name, '') = ''`
    )
    .all() as { fail_id: number; merchant_id: number; name: string }[];

  const relink = db.prepare(`UPDATE card_failure_events SET merchant_id = ? WHERE id = ?`);
  const setSales = db.prepare(
    `UPDATE merchants SET sales_name = ? WHERE id = ? AND COALESCE(sales_name, '') = ''`
  );

  let relinked = 0;
  let salesNamed = 0;

  for (const o of orphans) {
    const target = db
      .prepare(
        `SELECT id, sales_name FROM merchants
         WHERE name = ? AND COALESCE(sales_name, '') != ''
         ORDER BY id ASC LIMIT 1`
      )
      .get(o.name) as { id: number; sales_name: string } | undefined;

    if (target && target.id !== o.merchant_id) {
      relink.run(target.id, o.fail_id);
      relinked++;
    } else if (target) {
      setSales.run(target.sales_name, o.merchant_id);
      salesNamed++;
    }
  }

  const fromBatch = db
    .prepare(
      `SELECT m.id as merchant_id, b.filename
       FROM card_failure_events f
       JOIN merchants m ON m.id = f.merchant_id
       JOIN import_batches b ON b.id = f.batch_id
       WHERE COALESCE(m.sales_name, '') = ''`
    )
    .all() as { merchant_id: number; filename: string }[];

  const seen = new Set<number>();
  for (const row of fromBatch) {
    if (seen.has(row.merchant_id)) continue;
    seen.add(row.merchant_id);
    const sales = extractSalesFromFilename(row.filename.replace(/^\[失败补录\]\s*/, ""));
    if (sales) {
      setSales.run(sales, row.merchant_id);
      salesNamed++;
    }
  }

  return { relinked, salesNamed };
}
