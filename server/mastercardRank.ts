import { db } from "./db.js";
import { getMastercardLifetimeWarnHkd, getMastercardLifetimeAlertHkd } from "./insightRules.js";
import { getLeaderSalesUserIds } from "./leaderTeam.js";
import { MASTERCARD_TXN_SQL } from "./paymentChannel.js";

export const MASTERCARD_RANK_MIN_LIST_HKD = 1_000_000;

export interface MerchantMastercardRankRow {
  rank: number;
  id: number;
  name: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string | null;
  lifetimeAmount: number;
  txnCount: number;
  lastMastercardTxnTime: string | null;
  reachedWarn: boolean;
  reachedAlert: boolean;
}

function merchantAccessClause(role: string, userId: number): { where: string; params: number[] } {
  if (role === "admin") return { where: "", params: [] };
  if (role === "leader") {
    const ids = [userId, ...getLeaderSalesUserIds(userId)];
    const placeholders = ids.map(() => "?").join(", ");
    return { where: `WHERE m.sales_user_id IN (${placeholders})`, params: ids };
  }
  return { where: "WHERE m.sales_user_id = ?", params: [userId] };
}

export function listMerchantMastercardLifetimeRank(
  userId: number,
  role: string
): {
  minListThreshold: number;
  warnThreshold: number;
  alertThreshold: number;
  merchants: MerchantMastercardRankRow[];
} {
  const access = merchantAccessClause(role, userId);
  const sql = `
    SELECT m.id, m.name, m.merchant_code as merchantCode, m.sales_user_id as salesUserId,
      m.sales_name as salesName,
      COALESCE(SUM(t.amount), 0) as lifetimeAmount,
      COUNT(t.id) as txnCount,
      MAX(t.txn_time) as lastMastercardTxnTime
    FROM merchants m
    INNER JOIN transactions t ON t.merchant_id = m.id AND ${MASTERCARD_TXN_SQL}
    ${access.where}
    GROUP BY m.id
    HAVING lifetimeAmount >= ?
    ORDER BY lifetimeAmount DESC, m.name ASC`;

  const rows = db.prepare(sql).all(...access.params, MASTERCARD_RANK_MIN_LIST_HKD) as Array<{
    id: number;
    name: string;
    merchantCode: string | null;
    salesUserId: number | null;
    salesName: string | null;
    lifetimeAmount: number;
    txnCount: number;
    lastMastercardTxnTime: string | null;
  }>;

  const warnThreshold = getMastercardLifetimeWarnHkd();
  const alertThreshold = getMastercardLifetimeAlertHkd();

  const merchants = rows.map((row, index) => {
    const lifetimeAmount = Math.round(row.lifetimeAmount * 100) / 100;
    return {
      rank: index + 1,
      id: row.id,
      name: row.name,
      merchantCode: row.merchantCode,
      salesUserId: row.salesUserId,
      salesName: row.salesName,
      lifetimeAmount,
      txnCount: row.txnCount,
      lastMastercardTxnTime: row.lastMastercardTxnTime,
      reachedWarn: lifetimeAmount >= warnThreshold,
      reachedAlert: lifetimeAmount >= alertThreshold,
    };
  });

  return {
    minListThreshold: MASTERCARD_RANK_MIN_LIST_HKD,
    warnThreshold,
    alertThreshold,
    merchants,
  };
}
