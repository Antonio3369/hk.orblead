import * as XLSX from "xlsx";

export type LimitKind = "card" | "scan";

export interface MerchantLimitRow {
  merchantCode: string;
  merchantName: string | null;
  merchantShortName: string | null;
  cardSingle: number | null;
  cardDaily: number | null;
  cardMonthly: number | null;
  scanSingle: number | null;
  scanDaily: number | null;
  scanMonthly: number | null;
}

type LimitField =
  | "merchantCode"
  | "merchantName"
  | "merchantShortName"
  | "cardLimit"
  | "scanLimit"
  | "monthlyLimit"
  | "dailyLimit"
  | "singleLimit"
  | "visaLimit"
  | "masterLimit"
  | "unionPayLimit"
  | "wechatLimit"
  | "alipayLimit";

const COLUMN_MAP: Record<string, LimitField> = {
  merchantcode: "merchantCode",
  merchant_code: "merchantCode",
  商户编号: "merchantCode",
  商戶編號: "merchantCode",
  商户号: "merchantCode",
  商戶號: "merchantCode",

  商户名称: "merchantName",
  商戶名稱: "merchantName",
  merchantname: "merchantName",
  商户简称: "merchantShortName",
  商戶簡稱: "merchantShortName",

  cardlimit: "cardLimit",
  card_limit: "cardLimit",
  刷卡额度: "cardLimit",
  刷卡額度: "cardLimit",
  刷卡限额: "cardLimit",
  刷卡限額: "cardLimit",

  scanlimit: "scanLimit",
  scan_limit: "scanLimit",
  扫码额度: "scanLimit",
  掃碼額度: "scanLimit",
  扫码限额: "scanLimit",
  掃碼限額: "scanLimit",

  单月限额: "monthlyLimit",
  單月限額: "monthlyLimit",
  monthlylimit: "monthlyLimit",
  monthly_limit: "monthlyLimit",

  单日限额: "dailyLimit",
  單日限額: "dailyLimit",
  dailylimit: "dailyLimit",
  daily_limit: "dailyLimit",

  单笔限额: "singleLimit",
  單筆限額: "singleLimit",
  singlelimit: "singleLimit",
  single_limit: "singleLimit",

  visa: "visaLimit",
  master: "masterLimit",
  mastercard: "masterLimit",
  unionpay: "unionPayLimit",
  "union pay": "unionPayLimit",
  银联: "unionPayLimit",
  銀聯: "unionPayLimit",

  wechat: "wechatLimit",
  weixin: "wechatLimit",
  微信: "wechatLimit",
  alipay: "alipayLimit",
  支付宝: "alipayLimit",
  支付寶: "alipayLimit",
};

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function mapHeader(h: string): LimitField | undefined {
  const raw = String(h ?? "").trim();
  if (COLUMN_MAP[raw]) return COLUMN_MAP[raw];
  const key = normalizeHeader(h);
  if (COLUMN_MAP[key]) return COLUMN_MAP[key];
  const compact = key.replace(/[_\s-]/g, "");
  return COLUMN_MAP[compact];
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cell(line: unknown[], idx: number | undefined): string {
  if (idx === undefined) return "";
  return String(line[idx] ?? "").trim();
}

function readMatrix(buffer: Buffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

function readTierLimits(
  line: unknown[],
  fieldIndexes: Partial<Record<LimitField, number>>,
  opts: {
    hasAggregate: boolean;
    aggregateField: "cardLimit" | "scanLimit";
    hasMonthly: boolean;
    hasParts: boolean;
    partFields: Array<"visaLimit" | "masterLimit" | "unionPayLimit" | "wechatLimit" | "alipayLimit">;
  }
): { single: number | null; daily: number | null; monthly: number | null } {
  const single = parseAmount(line[fieldIndexes.singleLimit!]);
  const daily = parseAmount(line[fieldIndexes.dailyLimit!]);
  let monthly: number | null = null;

  if (opts.hasAggregate) {
    monthly = parseAmount(line[fieldIndexes[opts.aggregateField]!]);
  } else if (opts.hasMonthly) {
    monthly = parseAmount(line[fieldIndexes.monthlyLimit!]);
  } else if (opts.hasParts) {
    const parts = opts.partFields
      .map((f) => parseAmount(line[fieldIndexes[f]!]))
      .filter((n): n is number => n !== null);
    monthly = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;
  }

  return { single, daily, monthly };
}

export function parseMerchantLimitFile(
  buffer: Buffer,
  _filename: string,
  limitKind: LimitKind
): { rows: MerchantLimitRow[]; errors: string[] } {
  const matrix = readMatrix(buffer);
  const errors: string[] = [];
  if (matrix.length < 2) {
    return { rows: [], errors: ["檔案為空或缺少表頭"] };
  }

  const header = matrix[0] as unknown[];
  const fieldIndexes: Partial<Record<LimitField, number>> = {};
  header.forEach((h, i) => {
    const field = mapHeader(String(h));
    if (field) fieldIndexes[field] = i;
  });

  if (fieldIndexes.merchantCode === undefined) {
    return { rows: [], errors: ["缺少「商戶編號」列"] };
  }

  const hasMonthly = fieldIndexes.monthlyLimit !== undefined;
  const hasCardAggregate = fieldIndexes.cardLimit !== undefined;
  const hasScanAggregate = fieldIndexes.scanLimit !== undefined;
  const hasCardParts =
    fieldIndexes.visaLimit !== undefined ||
    fieldIndexes.masterLimit !== undefined ||
    fieldIndexes.unionPayLimit !== undefined;
  const hasScanParts =
    fieldIndexes.wechatLimit !== undefined || fieldIndexes.alipayLimit !== undefined;

  const hasKindLimit =
    limitKind === "card"
      ? hasCardAggregate || hasMonthly || hasCardParts
      : hasScanAggregate || hasMonthly || hasScanParts;

  if (!hasKindLimit) {
    const label = limitKind === "card" ? "刷卡" : "掃碼";
    return {
      rows: [],
      errors: [`缺少${label}額度列（如「單月限額」或「${label}額度」）`],
    };
  }

  const rows: MerchantLimitRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line || line.every((c) => String(c ?? "").trim() === "")) continue;

    const merchantCode = cell(line, fieldIndexes.merchantCode);
    if (!merchantCode) {
      errors.push(`第 ${r + 1} 行：商戶編號為空，已跳過`);
      continue;
    }

    let cardSingle: number | null = null;
    let cardDaily: number | null = null;
    let cardMonthly: number | null = null;
    let scanSingle: number | null = null;
    let scanDaily: number | null = null;
    let scanMonthly: number | null = null;

    if (limitKind === "card") {
      const tier = readTierLimits(line, fieldIndexes, {
        hasAggregate: hasCardAggregate,
        aggregateField: "cardLimit",
        hasMonthly,
        hasParts: hasCardParts,
        partFields: ["visaLimit", "masterLimit", "unionPayLimit"],
      });
      cardSingle = tier.single;
      cardDaily = tier.daily;
      cardMonthly = tier.monthly;
    } else {
      const tier = readTierLimits(line, fieldIndexes, {
        hasAggregate: hasScanAggregate,
        aggregateField: "scanLimit",
        hasMonthly,
        hasParts: hasScanParts,
        partFields: ["wechatLimit", "alipayLimit"],
      });
      scanSingle = tier.single;
      scanDaily = tier.daily;
      scanMonthly = tier.monthly;
    }

    if (cardMonthly === null && scanMonthly === null) continue;

    rows.push({
      merchantCode,
      merchantName: cell(line, fieldIndexes.merchantName) || null,
      merchantShortName: cell(line, fieldIndexes.merchantShortName) || null,
      cardSingle,
      cardDaily,
      cardMonthly,
      scanSingle,
      scanDaily,
      scanMonthly,
    });
  }

  return { rows, errors };
}
