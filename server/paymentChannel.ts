export type PaymentChannel = "card" | "scan" | "other";

function normalizePayText(payWallet: string, txnName = ""): string {
  return `${payWallet} ${txnName}`.toLowerCase().replace(/[_\s·]+/g, " ");
}

/** 是否為 Mastercard / 萬事達 交易（不含 Visa、銀聯等） */
export function isMastercardTransaction(payWallet: string, txnName = ""): boolean {
  const raw = normalizePayText(payWallet, txnName);
  if (!raw.trim()) return false;
  return (
    /\bmaster(card)?\b/.test(raw) ||
    raw.includes("万事达") ||
    raw.includes("萬事達")
  );
}

/** SQL 條件：transactions 別名須為 t */
export const MASTERCARD_TXN_SQL = `(
  LOWER(COALESCE(t.pay_wallet, '') || ' ' || COALESCE(t.txn_name, '')) LIKE '%master%'
  OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '万事达') > 0
  OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '萬事達') > 0
)`;

export const VISA_TXN_SQL = `(
  LOWER(COALESCE(t.pay_wallet, '') || ' ' || COALESCE(t.txn_name, '')) LIKE '%visa%'
)`;

export const UNIONPAY_TXN_SQL = `(
  LOWER(COALESCE(t.pay_wallet, '') || ' ' || COALESCE(t.txn_name, '')) LIKE '%union%pay%'
  OR LOWER(COALESCE(t.pay_wallet, '') || ' ' || COALESCE(t.txn_name, '')) LIKE '%unionpay%'
  OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '银联') > 0
  OR INSTR(COALESCE(t.pay_wallet, '') || COALESCE(t.txn_name, ''), '銀聯') > 0
)`;

/** Visa / Mastercard / 銀聯（境外卡方案，不含微信/支付寶等掃碼） */
export const OVERSEAS_CARD_TXN_SQL = `(${VISA_TXN_SQL} OR ${MASTERCARD_TXN_SQL} OR ${UNIONPAY_TXN_SQL})`;

/** 成功消費：transactions 僅含導入成功的記錄；排除退款等負數 */
export const SUCCESS_CONSUMPTION_TXN_SQL = `t.amount > 0`;

export type OverseasCardScheme = "visa" | "mastercard" | "unionpay";

export function classifyOverseasCardScheme(payWallet: string, txnName = ""): OverseasCardScheme | null {
  if (isMastercardTransaction(payWallet, txnName)) return "mastercard";
  const raw = normalizePayText(payWallet, txnName);
  if (!raw.trim()) return null;
  if (/\bvisa\b/.test(raw)) return "visa";
  if (
    /\bunion\s*pay\b/.test(raw) ||
    /\bunionpay\b/.test(raw) ||
    raw.includes("银联") ||
    raw.includes("銀聯")
  ) {
    return "unionpay";
  }
  return null;
}

export function isOverseasCardTransaction(payWallet: string, txnName = ""): boolean {
  return classifyOverseasCardScheme(payWallet, txnName) != null;
}

/** 刷卡：visa / master / UnionPay；掃碼：wechat / alipay */
export function classifyPaymentChannel(payWallet: string, txnName = ""): PaymentChannel {
  const raw = normalizePayText(payWallet, txnName);
  if (!raw.trim()) return "other";

  if (
    /\bvisa\b/.test(raw) ||
    /\bmaster(card)?\b/.test(raw) ||
    /\bunion\s*pay\b/.test(raw) ||
    /\bunionpay\b/.test(raw) ||
    raw.includes("银联") ||
    raw.includes("銀聯")
  ) {
    return "card";
  }

  if (
    /\bwechat\b/.test(raw) ||
    /\bweixin\b/.test(raw) ||
    /\balipay\b/.test(raw) ||
    /\bwx[\s-]?hk\b/.test(raw) ||
    raw.includes("微信") ||
    raw.includes("支付寶") ||
    raw.includes("支付宝")
  ) {
    return "scan";
  }

  return "other";
}
