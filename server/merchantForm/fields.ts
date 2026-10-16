export const APPLICATION_TEXT_FIELDS = [
  "legalName",
  "dbaName",
  "contact",
  "title",
  "mcc",
  "phone",
  "email",
  "sales",
  "bizAddr",
  "officeAddr",
  "maxTicket",
  "avgTicket",
  "avgMonthly",
  "bankName",
  "bankCode",
  "bankAccName",
  "bankAccount",
  "brNo",
  "brExpiry",
  "activationFee",
] as const;

export const APPLICATION_RATE_FIELDS = [
  "cpVisaDom", "cpVisaFor", "cpVisaSme",
  "cpMcDom", "cpMcFor", "cpMcSme",
  "cpAmexDom", "cpAmexFor",
  "cpUpDom",
  "cnpVisaDom", "cnpVisaFor",
  "cnpMcDom", "cnpMcFor",
  "cnpAmexDom", "cnpAmexFor",
  "alipayOffHk", "alipayOffCn",
  "alipayOn",
  "wxOffHk", "wxOffCn",
  "wxOn",
  "octOffHk",
  "octOn",
] as const;

export const APPLICATION_CHOICE_FIELDS = ["lang", "ownership", "years"] as const;

const FIELD_KEYS = [
  ...APPLICATION_TEXT_FIELDS,
  ...APPLICATION_RATE_FIELDS,
  ...APPLICATION_CHOICE_FIELDS,
];

const REQUIRED: { key: string; label: string }[] = [
  { key: "legalName", label: "商戶名稱" },
  { key: "contact", label: "聯絡人" },
  { key: "phone", label: "電話號碼" },
  { key: "email", label: "電郵" },
  { key: "bizAddr", label: "營業地址" },
  { key: "maxTicket", label: "單筆交易最大金額" },
  { key: "avgTicket", label: "平均每筆交易金額" },
  { key: "avgMonthly", label: "平均每月交易金額" },
  { key: "bankName", label: "銀行名稱" },
  { key: "bankCode", label: "銀行代碼" },
  { key: "bankAccName", label: "銀行賬戶名稱" },
  { key: "bankAccount", label: "銀行帳號" },
  { key: "brNo", label: "商業登記號碼" },
];

export type ApplicationPayload = Record<string, string>;

export function emptyApplication(salesName = ""): ApplicationPayload {
  const payload: ApplicationPayload = {};
  for (const key of FIELD_KEYS) payload[key] = "";
  payload.lang = "繁體中文 Traditional Chinese";
  payload.sales = salesName;
  return payload;
}

export function normalizeApplicationPayload(raw: unknown, salesName = ""): ApplicationPayload {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const payload = emptyApplication(salesName);
  for (const key of FIELD_KEYS) {
    const value = src[key];
    if (typeof value === "string") {
      payload[key] = key === "bankAccount" ? bankAccountDigits(value) : value.trim();
    }
  }
  if (!payload.lang) payload.lang = "繁體中文 Traditional Chinese";
  if (!payload.sales) payload.sales = salesName;
  return payload;
}

export function bankAccountDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function missingApplicationLabels(payload: ApplicationPayload): string[] {
  return REQUIRED.filter((field) => !payload[field.key]).map((field) => field.label);
}

export function applicationIssues(payload: ApplicationPayload): string[] {
  const issues = missingApplicationLabels(payload);
  const digits = bankAccountDigits(payload.bankAccount ?? "");
  if (payload.bankAccount && digits.length < 9) issues.push("銀行帳號不得少於 9 位數");
  return issues;
}

export function applicationPdfName(legalName: string): string {
  const safe = (legalName || "merchant").replace(/[\\/:*?"<>|]/g, "").trim() || "merchant";
  return `YeahPay_商戶申請表及合約_${safe}.pdf`;
}
