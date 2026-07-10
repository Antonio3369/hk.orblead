export type PaymentChannel = "card" | "scan" | "other";

/** 刷卡：visa / master / UnionPay；掃碼：wechat / alipay */
export function classifyPaymentChannel(payWallet: string, txnName = ""): PaymentChannel {
  const raw = `${payWallet} ${txnName}`.toLowerCase().replace(/[_\s·]+/g, " ");
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
