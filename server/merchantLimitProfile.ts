import { db } from "./db.js";
import { getMtdThroughYesterdayLabel } from "./analytics.js";

export interface ChannelLimitTier {
  singleLimit: number | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  mtdUsed: number;
  monthlyPercent: number | null;
}

export interface MerchantLimitProfile {
  merchantCode: string | null;
  mtdLabel: string;
  hasLimits: boolean;
  card: ChannelLimitTier;
  scan: ChannelLimitTier;
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMtdRange(): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  if (yesterday < monthStart) {
    return { start: formatLocalYmd(monthStart), end: formatLocalYmd(monthStart) };
  }
  return { start: formatLocalYmd(monthStart), end: formatLocalYmd(yesterday) };
}

function limitPercent(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.round((used / limit) * 1000) / 10;
}

function emptyTier(): ChannelLimitTier {
  return {
    singleLimit: null,
    dailyLimit: null,
    monthlyLimit: null,
    mtdUsed: 0,
    monthlyPercent: null,
  };
}

export function getMerchantLimitProfile(merchantId: number): MerchantLimitProfile {
  const merchant = db
    .prepare(`SELECT merchant_code as merchantCode FROM merchants WHERE id = ?`)
    .get(merchantId) as { merchantCode: string | null } | undefined;

  const mtd = getMtdRange();
  const usage = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN payment_channel = 'card' AND substr(txn_time, 1, 10) >= ? AND substr(txn_time, 1, 10) <= ? THEN amount ELSE 0 END), 0) as mtdCard,
        COALESCE(SUM(CASE WHEN payment_channel = 'scan' AND substr(txn_time, 1, 10) >= ? AND substr(txn_time, 1, 10) <= ? THEN amount ELSE 0 END), 0) as mtdScan
       FROM transactions WHERE merchant_id = ?`
    )
    .get(mtd.start, mtd.end, mtd.start, mtd.end, merchantId) as {
    mtdCard: number;
    mtdScan: number;
  };

  const mtdCard = Math.round((usage?.mtdCard ?? 0) * 100) / 100;
  const mtdScan = Math.round((usage?.mtdScan ?? 0) * 100) / 100;

  const code = merchant?.merchantCode?.trim();
  if (!code) {
    return {
      merchantCode: null,
      mtdLabel: getMtdThroughYesterdayLabel(),
      hasLimits: false,
      card: { ...emptyTier(), mtdUsed: mtdCard },
      scan: { ...emptyTier(), mtdUsed: mtdScan },
    };
  }

  const limits = db
    .prepare(
      `SELECT card_single_limit, card_daily_limit, card_limit,
        scan_single_limit, scan_daily_limit, scan_limit
       FROM merchant_channel_limits WHERE merchant_code = ?`
    )
    .get(code) as
    | {
        card_single_limit: number | null;
        card_daily_limit: number | null;
        card_limit: number | null;
        scan_single_limit: number | null;
        scan_daily_limit: number | null;
        scan_limit: number | null;
      }
    | undefined;

  if (!limits) {
    return {
      merchantCode: code,
      mtdLabel: getMtdThroughYesterdayLabel(),
      hasLimits: false,
      card: { ...emptyTier(), mtdUsed: mtdCard },
      scan: { ...emptyTier(), mtdUsed: mtdScan },
    };
  }

  const cardMonthly = limits.card_limit;
  const scanMonthly = limits.scan_limit;

  return {
    merchantCode: code,
    mtdLabel: getMtdThroughYesterdayLabel(),
    hasLimits: Boolean(cardMonthly || scanMonthly),
    card: {
      singleLimit: limits.card_single_limit,
      dailyLimit: limits.card_daily_limit,
      monthlyLimit: cardMonthly,
      mtdUsed: mtdCard,
      monthlyPercent: limitPercent(mtdCard, cardMonthly),
    },
    scan: {
      singleLimit: limits.scan_single_limit,
      dailyLimit: limits.scan_daily_limit,
      monthlyLimit: scanMonthly,
      mtdUsed: mtdScan,
      monthlyPercent: limitPercent(mtdScan, scanMonthly),
    },
  };
}
