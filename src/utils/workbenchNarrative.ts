import {
  formatChangePercent,
  type AdminDashboardCharts,
  type AdminMerchantInsightBucket,
  type AdminMonthCompare,
  type PersonalDashboardCharts,
  type SalesHomeInsightSnapshot,
} from "@/api/client";
import { calcDailyAvgChangePercent } from "@/utils/dailyAvgChange";

export type NarrativeRole = "admin" | "leader" | "sales";

export interface TeamUnreadHint {
  displayName: string;
  unreadAlerts: number;
}

export interface WorkbenchCurrentMonthSnapshot {
  periodLabel: string;
  totalAmount: number;
  dailyAvgChangePercent: number | null;
  lastMonthLabel: string;
}

export interface WorkbenchNarrativeInput {
  displayName: string | null | undefined;
  role: NarrativeRole;
  monthCompare: AdminMonthCompare | null | undefined;
  currentMonth: WorkbenchCurrentMonthSnapshot | null | undefined;
  buckets: AdminMerchantInsightBucket[] | null | undefined;
  teamUnread?: TeamUnreadHint[];
}

export interface WorkbenchNarrativeParts {
  greeting: string;
  opening: string;
  continuation: string | null;
}

type DashboardChartsSlice = Pick<
  AdminDashboardCharts,
  "monthlyTrend" | "monthCompare" | "merchantInsight"
>;

function formatAmountWan(amount: number): string {
  const wan = amount / 10000;
  if (wan >= 100) return `${Math.round(wan).toLocaleString("zh-HK")} 萬`;
  if (wan >= 10) return `${(Math.round(wan * 10) / 10).toFixed(1)} 萬`;
  return `${(Math.round(wan * 100) / 100).toFixed(2)} 萬`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatChangePercent(value)}%`;
}

function parseMtdEndDay(label: string): number | null {
  const match = label.match(/(\d+)日\s*$/);
  return match ? Number(match[1]) : null;
}

/** 從工作台圖表 / Hero 摘要解析本月 MTD，供敘事「起」使用。 */
export function resolveWorkbenchCurrentMonth(
  homeInsight: SalesHomeInsightSnapshot | undefined,
  charts: DashboardChartsSlice | PersonalDashboardCharts | undefined,
  monthCompare: AdminMonthCompare | null | undefined
): WorkbenchCurrentMonthSnapshot | null {
  const lastMonthLabel = monthCompare?.lastMonth?.chartLabel ?? "上月";

  if (homeInsight) {
    return {
      periodLabel: homeInsight.mtdLabel,
      totalAmount: homeInsight.mtdAmount,
      dailyAvgChangePercent: homeInsight.dailyAvgChangePercent,
      lastMonthLabel,
    };
  }

  const current = charts?.monthlyTrend?.find((m) => m.isCurrent);
  if (!current) return null;

  const periodLabel = charts?.merchantInsight?.mtdLabel ?? current.label;
  const last = monthCompare?.lastMonth;
  const mtdDays = parseMtdEndDay(periodLabel);
  const dailyAvgChangePercent =
    last && mtdDays
      ? calcDailyAvgChangePercent(current.totalAmount, mtdDays, last.totalAmount, last.days)
      : null;

  return {
    periodLabel,
    totalAmount: current.totalAmount,
    dailyAvgChangePercent,
    lastMonthLabel,
  };
}

function bucketCount(
  buckets: AdminMerchantInsightBucket[] | null | undefined,
  key: AdminMerchantInsightBucket["key"]
): { count: number; percent: number } {
  const row = buckets?.find((b) => b.key === key);
  return { count: row?.count ?? 0, percent: row?.percent ?? 0 };
}

function narrativeSubject(role: NarrativeRole): string {
  return role === "admin" ? "全機構交易額" : "你名下交易額";
}

function buildMonthCompareOpening(
  role: NarrativeRole,
  compare: AdminMonthCompare
): string {
  const last = compare.lastMonth;
  const prev = compare.previousMonth;
  const subject = narrativeSubject(role);
  return `${last.label}${subject} ${formatAmountWan(last.totalAmount)}，較 ${prev.label} ${formatSignedPercent(compare.amountChangePercent)}；日均 ${formatSignedPercent(compare.dailyAvgChangePercent)}。`;
}

function buildCurrentMonthOpening(
  role: NarrativeRole,
  currentMonth: WorkbenchCurrentMonthSnapshot
): string {
  const subject = narrativeSubject(role);
  const dailyPart =
    currentMonth.dailyAvgChangePercent === null
      ? ""
      : `，日均較 ${currentMonth.lastMonthLabel} ${formatSignedPercent(currentMonth.dailyAvgChangePercent)}`;
  return `${currentMonth.periodLabel}${subject} ${formatAmountWan(currentMonth.totalAmount)}${dailyPart}。`;
}

function buildContinuation(
  role: NarrativeRole,
  buckets: AdminMerchantInsightBucket[] | null | undefined,
  teamUnread: TeamUnreadHint[] | undefined,
  amountChangePercent: number | null
): string {
  const rising = bucketCount(buckets, "rising");
  const declining = bucketCount(buckets, "declining");
  const silent = bucketCount(buckets, "newSilent");
  const up = (amountChangePercent ?? 0) >= 0;

  let core: string;
  if (up) {
    if (rising.count > 0 && (declining.count > 0 || silent.count > 0)) {
      core = `增長主要來自 ${rising.count} 家上漲商戶；另有 ${declining.count} 家日均下滑、${silent.count} 家新沉默，建議優先跟進。`;
    } else if (rising.count > 0) {
      core = `拉升主要來自 ${rising.count} 家上漲商戶；下跌與新沉默戶偏少。`;
    } else if (declining.count > 0 || silent.count > 0) {
      core = `整體額度有升，但仍有 ${declining.count} 家下滑、${silent.count} 家新沉默，建議關注結構。`;
    } else {
      core = "商戶動態以平穩為主，暫無突出的上漲或下跌集中。";
    }
  } else if (declining.count > 0 || silent.count > 0) {
    const share =
      declining.percent >= 15
        ? `下跌戶約佔 ${Math.round(declining.percent)}%；`
        : "";
    core = `下跌集中跡象較明顯，${share}下滑 ${declining.count} 家、新沉默 ${silent.count} 家；上漲 ${rising.count} 家。`;
  } else {
    core = `整體偏弱，但新沉默與下滑戶不多（上漲 ${rising.count} 家）；可再核對頭牌商戶節奏。`;
  }

  if (role !== "leader") return core;

  const withUnread = (teamUnread ?? [])
    .filter((s) => s.unreadAlerts > 0)
    .sort((a, b) => b.unreadAlerts - a.unreadAlerts || a.displayName.localeCompare(b.displayName, "zh-HK"));

  const stem = core.replace(/。$/, "");
  if (withUnread.length === 0) {
    return `${stem}；團隊暫無未跟進預警。`;
  }

  const names = withUnread
    .slice(0, 2)
    .map((s) => s.displayName)
    .join("、");
  return `${stem}；團隊未跟進預警偏多的是 ${names}。`;
}

function hasMonthCompareData(compare: AdminMonthCompare | null | undefined): compare is AdminMonthCompare {
  return !!compare && (compare.lastMonth.totalAmount > 0 || compare.previousMonth.totalAmount > 0);
}

function hasCurrentMonthData(currentMonth: WorkbenchCurrentMonthSnapshot | null | undefined): currentMonth is WorkbenchCurrentMonthSnapshot {
  if (!currentMonth) return false;
  if (currentMonth.totalAmount > 0) return true;
  return !currentMonth.periodLabel.includes("暫無本月數據");
}

/** 工作台環比「稱呼 → 起 → 承」文案（無 LLM）。 */
export function buildWorkbenchNarrative(input: WorkbenchNarrativeInput): WorkbenchNarrativeParts {
  const name = input.displayName?.trim();
  const greeting = name ? `${name}，您好。` : "您好。";

  const compare = input.monthCompare;
  const hasCompareMonths = hasMonthCompareData(compare);
  const currentMonth = hasCurrentMonthData(input.currentMonth) ? input.currentMonth : null;

  const openingParts: string[] = [];
  if (hasCompareMonths) {
    openingParts.push(buildMonthCompareOpening(input.role, compare));
  }
  if (currentMonth) {
    openingParts.push(buildCurrentMonthOpening(input.role, currentMonth));
  }
  if (!hasCompareMonths && currentMonth) {
    openingParts.push("上月與上上月尚無完整對比數據，補齊後會自動更新環比。");
  }

  if (openingParts.length === 0) {
    return {
      greeting,
      opening: "尚無完整對比月數據，暫時無法給出環比起承；有完整上月與上上月後會自動更新。",
      continuation: null,
    };
  }

  const structureSignal = hasCompareMonths
    ? compare.amountChangePercent
    : currentMonth?.dailyAvgChangePercent ?? null;

  const hasBuckets = (input.buckets?.reduce((sum, b) => sum + b.count, 0) ?? 0) > 0;
  const continuation = hasBuckets
    ? buildContinuation(input.role, input.buckets, input.teamUnread, structureSignal)
    : null;

  return {
    greeting,
    opening: openingParts.join(""),
    continuation,
  };
}
