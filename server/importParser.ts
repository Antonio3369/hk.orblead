import * as XLSX from "xlsx";
import { isFailedStatus } from "./cardFailure.js";
import { extractSalesFromFilename } from "./salesFromFilename.js";

export { extractSalesFromFilename } from "./salesFromFilename.js";

export interface RawTransactionRow {
  merchantName: string;
  merchantCode?: string;
  txnName: string;
  txnTime: string;
  amount: number;
  detail: string;
  salesName: string;
  payWallet?: string;
  orderNo?: string;
  cardNo?: string;
  /** 卡歸屬地：外地 / 本地 / 不区分 / 未知（旧报表可能无此列） */
  cardRegion?: string;
}

export interface RawFailureRow {
  merchantName: string;
  merchantCode?: string;
  txnName: string;
  txnTime: string;
  amount: number;
  status: string;
  cardRegion: string;
  orderNo: string;
  detail: string;
  salesName: string;
}

/** 列名 → 字段（简体/繁体/英文） */
const COLUMN_MAP: Record<string, keyof RawTransactionRow | "skip" | "orderType" | "status" | "txnType" | "payWallet" | "orderNo" | "currency" | "cardRegion" | "cardNo"> = {
  merchant: "merchantName",
  merchantname: "merchantName",
  商户: "merchantName",
  商户名称: "merchantName",
  商戶名稱: "merchantName",
  商户名: "merchantName",
  商戶簡稱: "merchantName",
  商户简称: "merchantName",
  商户编号: "merchantCode",
  商戶編號: "merchantCode",
  客户: "merchantName",
  客户名称: "merchantName",
  store: "merchantName",
  门店: "merchantName",

  txnname: "txnName",
  交易名称: "txnName",
  交易名: "txnName",
  业务类型: "txnName",
  類型: "orderType",
  类型: "orderType",

  txntime: "txnTime",
  time: "txnTime",
  date: "txnTime",
  datetime: "txnTime",
  交易时间: "txnTime",
  创建时间: "txnTime",
  創建時間: "txnTime",
  建立時間: "txnTime",
  建立时间: "txnTime",
  时间: "txnTime",
  日期: "txnTime",
  交易日期: "txnTime",

  amount: "amount",
  金额: "amount",
  金額: "amount",
  交易金额: "amount",
  總金額: "amount",
  总金额: "amount",
  交易额: "amount",
  收入: "amount",
  实收: "amount",

  交易类型: "txnType",
  交易類型: "txnType",
  支付钱包: "payWallet",
  支付錢包: "payWallet",

  detail: "detail",
  交易明细: "detail",
  交易明細: "detail",
  明细: "detail",
  備註: "detail",
  备注: "detail",
  说明: "detail",
  description: "detail",

  交易订单号: "orderNo",
  交易訂單號: "orderNo",

  状态: "status",
  狀態: "status",
  交易币种: "currency",
  交易幣種: "currency",

  卡归属地: "cardRegion",
  卡歸屬地: "cardRegion",
  卡屬地: "cardRegion",
  卡号: "cardNo",
  卡號: "cardNo",

  sales: "salesName",
  salesname: "salesName",
  销售: "salesName",
  业务员: "salesName",
  销售姓名: "salesName",
  销售名称: "salesName",
  所属销售: "salesName",
  客户经理: "salesName",
  跟进人: "salesName",
  下級代理商名稱: "salesName",
  下级代理商名称: "salesName",
  業務員: "salesName",
  销售人员: "salesName",
};

type ExtraIndexes = Partial<
  Record<
    "orderType" | "status" | "txnType" | "payWallet" | "orderNo" | "currency" | "cardRegion" | "cardNo",
    number
  >
>;

function normalizeKey(h: string): string {
  return h.trim().replace(/\s+/g, "").toLowerCase();
}

type MapHeaderResult = keyof RawTransactionRow | keyof ExtraIndexes | "skip";

function mapHeader(h: string): MapHeaderResult | null {
  const raw = h.trim().replace(/^\uFEFF/, "");
  const lower = normalizeKey(raw);
  const hit = COLUMN_MAP[raw] ?? COLUMN_MAP[lower];
  return hit ?? null;
}

/** 存本地时间字符串，避免 UTC 偏移导致月份统计偏差 */
function formatLocalDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function excelDateToIso(value: unknown): string | null {
  if (value instanceof Date) {
    return formatLocalDateTime(value);
  }
  if (typeof value === "number" && value > 20000 && value < 100000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const d = new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
      return formatLocalDateTime(d);
    }
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    const d = new Date(s.replace(/\//g, "-"));
    if (!Number.isNaN(d.getTime())) return formatLocalDateTime(d);
  }
  return null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").replace(/¥|￥|HK\$|\$/g, "").trim());
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function parseCsvUtf8(buffer: Buffer): unknown[][] {
  let text = buffer.toString("utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: unknown[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field.trim());
      field = "";
    } else if (c === "\n" || (c === "\r" && next === "\n")) {
      row.push(field.trim());
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      if (c === "\r") i++;
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

function sheetToMatrix(buffer: Buffer, filename: string): { matrix: unknown[][]; sheetCount: number } {
  if (filename.toLowerCase().endsWith(".csv")) {
    const matrix = parseCsvUtf8(buffer);
    return { matrix, sheetCount: 1 };
  }
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const combined: unknown[][] = [];
  let headerKey = "";
  let sheetCount = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    if (matrix.length < 2) continue;

    sheetCount++;
    const header = matrix[0].map((c) => String(c ?? ""));
    const key = header.join("|");

    if (combined.length === 0) {
      combined.push(...matrix);
      headerKey = key;
    } else {
      const start = key === headerKey ? 1 : 0;
      combined.push(...matrix.slice(start));
    }
  }

  return { matrix: combined, sheetCount: sheetCount || 1 };
}

function isZhifuFormat(headerRow: string[]): boolean {
  const set = new Set(headerRow.map((h) => h.trim()));
  const hasTime = set.has("建立時間") || set.has("创建时间") || set.has("創建時間");
  const hasMerchant =
    set.has("商戶簡稱") ||
    set.has("商户简称") ||
    set.has("商戶名稱") ||
    set.has("商户名称");
  return hasTime && hasMerchant;
}

function isOrgTransactionReport(headerRow: string[]): boolean {
  const set = new Set(headerRow.map((h) => h.trim()));
  return set.has("業務員") || set.has("业务员");
}

function normalizeStatus(status: string): string {
  return status.trim();
}

function isSuccessStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return !s || s === "成功" || s === "交易成功";
}

function isPendingStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return s === "交易中" || s === "交易关单" || s === "交易關單";
}

function isRefundSuccessStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return s === "退款成功" || s === "撤销成功" || s === "撤銷成功";
}

function preferAmountColumnIndex(headerRow: string[]): number {
  for (const h of ["總金額", "总金额", "交易金额", "交易金額", "金額", "金额"]) {
    const i = headerRow.findIndex((x) => x.trim() === h);
    if (i >= 0) return i;
  }
  return -1;
}

function merchantShortNameIndex(headerRow: string[]): number {
  for (const h of ["商戶簡稱", "商户简称", "商戶名稱", "商户名称"]) {
    const i = headerRow.findIndex((x) => x.trim() === h);
    if (i >= 0) return i;
  }
  return -1;
}

function cell(line: unknown[], idx: number | undefined): string {
  if (idx === undefined) return "";
  return String(line[idx] ?? "").trim();
}

function buildTxnName(
  txnName: string,
  txnType: string,
  payWallet: string,
  orderType: string
): string {
  if (txnName) return txnName;
  const parts = [orderType, txnType, payWallet].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "交易";
}

function buildDetail(parts: Record<string, string>): string {
  return Object.entries(parts)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}:${v}`)
    .join(" | ");
}

function applyOrderTypeAmount(amount: number, orderType: string): number {
  if (orderType === "退款" || orderType === "撤銷" || orderType === "撤销") {
    return -Math.abs(amount);
  }
  return amount;
}

export function parseTransactionFile(
  buffer: Buffer,
  filename: string,
  options?: { salesOverride?: string }
): {
  rows: RawTransactionRow[];
  failureRows: RawFailureRow[];
  errors: string[];
  format?: string;
  sheetCount?: number;
  salesFromFile?: string | null;
} {
  const { matrix, sheetCount } = sheetToMatrix(buffer, filename);
  const errors: string[] = [];
  const rows: RawTransactionRow[] = [];
  const failureRows: RawFailureRow[] = [];

  if (matrix.length < 2) {
    return { rows: [], failureRows: [], errors: ["檔案為空或缺少數據行"] };
  }

  if (sheetCount > 1) {
    errors.push(`已合併 ${sheetCount} 個工作表（每週一頁）`);
  }

  const headerRow = matrix[0].map((c) => String(c ?? ""));
  const fieldIndexes: Partial<Record<keyof RawTransactionRow, number>> = {};
  const extra: ExtraIndexes = {};

  headerRow.forEach((h, i) => {
    const mapped = mapHeader(h);
    if (!mapped || mapped === "skip") return;
    if (
      mapped === "orderType" ||
      mapped === "status" ||
      mapped === "txnType" ||
      mapped === "payWallet" ||
      mapped === "orderNo" ||
      mapped === "currency" ||
      mapped === "cardRegion" ||
      mapped === "cardNo"
    ) {
      extra[mapped] = i;
    } else {
      fieldIndexes[mapped] = i;
    }
  });

  const zhifu = isZhifuFormat(headerRow);
  const orgReport = isOrgTransactionReport(headerRow);
  const amountIdx = preferAmountColumnIndex(headerRow);
  if (amountIdx >= 0) {
    fieldIndexes.amount = amountIdx;
  }

  // 智付：优先用商户简称列
  const shortNameIdx = merchantShortNameIndex(headerRow);
  if (zhifu && shortNameIdx >= 0) {
    fieldIndexes.merchantName = shortNameIdx;
  } else if (zhifu && fieldIndexes.merchantName === undefined) {
    const nameIdx = headerRow.findIndex((h) => ["商戶名稱", "商户名称"].includes(h.trim()));
    if (nameIdx >= 0) fieldIndexes.merchantName = nameIdx;
  }

  const required: (keyof RawTransactionRow)[] = ["merchantName", "txnTime", "amount"];
  const missing = required.filter((k) => fieldIndexes[k] === undefined);
  if (missing.length > 0) {
    return {
      rows: [],
      failureRows: [],
      errors: [
        `缺少必需列。需要：商戶名稱/商戶簡稱、交易時間/建立時間/創建時間、金額/總金額（目前缺少：${missing.join("、")}）`,
      ],
    };
  }

  let skippedStatus = 0;
  let importedFailures = 0;

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line || line.every((c) => String(c ?? "").trim() === "")) continue;

    const get = (key: keyof RawTransactionRow) => cell(line, fieldIndexes[key]);

    const status = cell(line, extra.status);

    let merchantName = get("merchantName");
    const merchantCode = get("merchantCode");
    if ((zhifu || orgReport) && shortNameIdx >= 0) {
      const shortName = cell(line, shortNameIdx);
      if (shortName) merchantName = shortName;
    }

    const orderType = cell(line, extra.orderType);
    const txnType = cell(line, extra.txnType);
    const payWallet = cell(line, extra.payWallet);
    const orderNo = cell(line, extra.orderNo);
    const currency = cell(line, extra.currency);
    const cardRegion = cell(line, extra.cardRegion);
    const cardNo = cell(line, extra.cardNo);

    const txnName = buildTxnName(get("txnName"), txnType, payWallet, orderType);
    const txnTime = excelDateToIso(line[fieldIndexes.txnTime!]);
    let amount = parseAmount(line[fieldIndexes.amount!]);
    if (amount === null && fieldIndexes.amount !== undefined) {
      amount = parseAmount(get("amount"));
    }

    let salesName = get("salesName");
    if (salesName === "自营商户" || salesName === "自營商戶" || salesName === "-") {
      salesName = "";
    }

    if (isPendingStatus(status)) {
      skippedStatus++;
      continue;
    }

    if (!isSuccessStatus(status) && !isRefundSuccessStatus(status)) {
      skippedStatus++;
      if (isFailedStatus(status) && merchantName && txnTime) {
        failureRows.push({
          merchantName,
          merchantCode,
          txnName,
          txnTime,
          amount: amount ?? 0,
          status,
          cardRegion,
          orderNo,
          detail:
            get("detail") ||
            buildDetail({
              订单号: orderNo,
              币种: currency,
              类型: orderType,
              状态: status,
              卡归属地: cardRegion,
            }),
          salesName,
        });
        importedFailures++;
      }
      continue;
    }

    if (!merchantName || !txnTime || amount === null) {
      errors.push(`第 ${r + 1} 行：商戶、時間或金額無效，已跳過`);
      continue;
    }

    amount = applyOrderTypeAmount(amount, orderType);

    const detail =
      get("detail") ||
      buildDetail({
        订单号: orderNo,
        币种: currency,
        类型: orderType,
        状态: status,
        卡归属地: cardRegion,
      });

    rows.push({
      merchantName,
      merchantCode,
      txnName,
      txnTime,
      amount,
      detail,
      salesName,
      payWallet,
      orderNo: orderNo || undefined,
      cardNo: cardNo || undefined,
      cardRegion: cardRegion || undefined,
    });
  }

  const salesFromFile = extractSalesFromFilename(filename);
  if (salesFromFile) {
    for (const row of rows) {
      if (!row.salesName) row.salesName = salesFromFile;
    }
    for (const row of failureRows) {
      if (!row.salesName) row.salesName = salesFromFile;
    }
    errors.push(`已從檔案名識別銷售：${salesFromFile}`);
  }

  const salesOverride = options?.salesOverride?.trim();
  if (salesOverride) {
    for (const row of rows) {
      if (!row.salesName) row.salesName = salesOverride;
    }
    for (const row of failureRows) {
      if (!row.salesName) row.salesName = salesOverride;
    }
    errors.push(`已指定歸屬銷售：${salesOverride}`);
  }

  const allRows = [...rows, ...failureRows];
  if (allRows.length > 0 && allRows.every((r) => !r.salesName)) {
    errors.push(
      "警告：未能識別銷售歸屬（下級代理商均為自營商戶且檔名無銷售標識）。請上傳時指定銷售，或將檔案重命名為 Alex202604-… 後再導入"
    );
  }

  if (skippedStatus > 0) {
    errors.push(`已跳過 ${skippedStatus} 條非「成功」狀態記錄`);
  }
  if (importedFailures > 0) {
    errors.push(`已收錄 ${importedFailures} 條交易失敗訂單`);
  }

  return {
    rows,
    failureRows,
    errors,
    format: orgReport ? "org-report" : zhifu ? "zhifu" : "generic",
    sheetCount,
    salesFromFile,
  };
}
