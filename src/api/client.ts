const TOKEN_KEY = "merchant-agent-token";
export const LOGIN_NOTICE_KEY = "merchant-agent-login-notice";

export function stashLoginNotice(message: string) {
  sessionStorage.setItem(LOGIN_NOTICE_KEY, message);
}

export type UserRole = "admin" | "sales" | "leader";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  email?: string | null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body = options.body;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const res = await fetch(`/api${path}`, { ...options, headers, body });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `請求失敗 ${res.status}`);
  }
  return data as T;
}

export function formatChangePercent(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** 港元金額（HKD） */
export function formatHkd(amount: number): string {
  return `HKD ${Math.round(amount).toLocaleString()}`;
}

/** 港元萬元（HKD） */
export function formatHkdWan(wan: number): string {
  return `HKD ${wan.toFixed(2)}萬`;
}

export interface TigerTeamSalesRow {
  id: number;
  displayName: string;
  username: string;
  role?: "sales" | "leader";
  leaderDisplayName?: string | null;
  assignedMerchantCount: number;
  activeMerchantCount: number;
  lastMonthAmount: number;
  lastMonthLabel: string;
  mtdAmount: number;
  mtdLabel: string;
  mtdDailyAvgChangePercent: number | null;
  newSilentCount: number;
  decliningCount: number;
  risingCount: number;
  unreadAlerts: number;
  totalAlerts: number;
}

export type SalesListSortKey =
  | "lastMonthAmount"
  | "newSilent"
  | "declining"
  | "rising"
  | "unreadAlerts";

export type MerchantListSortKey =
  | "lastMonthAmount"
  | "newSilent"
  | "declining"
  | "rising"
  | "unreadAlerts";

export type MerchantInsightStatus = "newSilent" | "declining" | "rising" | "flat" | "inactive";

export interface MerchantInsightRow {
  id: number;
  name: string;
  merchantCode: string | null;
  lastMonthAmount: number;
  mtdAmount: number;
  dailyAvgChangePercent: number | null;
  status: MerchantInsightStatus;
  lastTxnDate: string | null;
  hasUnreadAlert: boolean;
  unreadAlertPeriods: Array<"week" | "month">;
}

export interface SalesInsightSummary {
  assignedMerchantCount: number;
  activeMerchantCount: number;
  newSilentCount: number;
  decliningCount: number;
  risingCount: number;
}

export interface SalesHomeInsightSnapshot {
  mtdLabel: string;
  mtdAmount: number;
  dailyAvgChangePercent: number | null;
  insightSummary: SalesInsightSummary;
  unreadAlertMerchantCount: number;
}

export interface DashboardDayTrendPoint {
  date: string;
  label: string;
  amount: number;
  txnCount: number;
}

export interface DashboardRolling30Comparison {
  recentLabel: string;
  recentRangeLabel: string;
  recentAmount: number;
  recentTxnCount: number;
  recentMerchantCount: number;
  previousLabel: string;
  previousRangeLabel: string;
  previousAmount: number;
  previousTxnCount: number;
  previousMerchantCount: number;
  amountChangePercent: number | null;
  dailyAvgChangePercent: number | null;
}

export interface AdminMonthCompareSide {
  label: string;
  chartLabel: string;
  year: number;
  month: number;
  totalAmount: number;
  txnCount: number;
  merchantCount: number;
  days: number;
}

export interface AdminMonthCompare {
  lastMonth: AdminMonthCompareSide;
  previousMonth: AdminMonthCompareSide;
  amountChangePercent: number | null;
  dailyAvgChangePercent: number | null;
}

export interface AdminSalesRankRow {
  rank: number;
  id: number;
  displayName: string;
  lastMonthAmount: number;
  sharePercent: number;
  activeMerchantCount: number;
  assignedMerchantCount: number;
}

export interface AdminMerchantInsightBucket {
  key: "rising" | "declining" | "newSilent" | "flat";
  label: string;
  count: number;
  percent: number;
}

export interface AdminMerchantRankRow {
  rank: number;
  id: number;
  name: string;
  salesName: string | null;
  lastMonthAmount: number;
  sharePercent: number;
}

export interface AdminDailyMonthCrossPoint {
  day: number;
  label: string;
  currentAmount: number | null;
  currentTxnCount: number | null;
  lastAmount: number;
  lastTxnCount: number;
}

export interface AdminDashboardCharts {
  monthlyTrend: Array<{
    year: number;
    month: number;
    label: string;
    chartLabel: string;
    totalAmount: number;
    txnCount: number;
    merchantCount: number;
    isCurrent: boolean;
  }>;
  monthCompare: AdminMonthCompare;
  salesRanking: {
    rankMonth: string;
    orgLastMonthTotal: number;
    sales: AdminSalesRankRow[];
  };
  merchantInsight: {
    rankMonth: string;
    mtdLabel: string;
    totalAssigned: number;
    buckets: AdminMerchantInsightBucket[];
  };
  merchantBoxOffice: {
    rankMonth: string;
    orgLastMonthTotal: number;
    merchants: AdminMerchantRankRow[];
  };
  dailyMonthCross: {
    currentMonthLabel: string;
    lastMonthLabel: string;
    points: AdminDailyMonthCrossPoint[];
  };
}

export interface PersonalDashboardCharts {
  monthlyTrend: AdminDashboardCharts["monthlyTrend"];
  monthCompare: AdminMonthCompare;
  merchantInsight: AdminDashboardCharts["merchantInsight"];
  dailyMonthCross: AdminDashboardCharts["dailyMonthCross"];
}

export type LeaderDashboardCharts = AdminDashboardCharts;

export interface LeaderTeamOverview {
  teamSummary: {
    salesCount: number;
    unreadAlerts: number;
    salesWithUnread: number;
  };
  charts: LeaderDashboardCharts;
}

export interface SalesPeriodColumn {
  key: "twoMonthsAgo" | "lastMonth" | "currentMtd";
  title: string;
  rangeLabel: string;
  totalAmount: number;
  assignedMerchantCount: number;
  activeMerchantCount: number;
  amountChangePercent: number | null;
  dailyAvgChangePercent: number | null;
}

export interface Alert {
  id: number;
  merchant_id: number;
  merchant_name: string;
  sales_user_id: number | null;
  sales_name: string | null;
  admin_read: number;
  has_leader_reply: number;
  period: "day" | "week" | "month";
  current_label: string;
  previous_label: string;
  current_amount: number;
  previous_amount: number;
  change_percent: number;
  message: string;
  acknowledged: number;
  computed_at?: string;
  ref_key?: string;
  pending_admin_read?: number;
  leader_pending_reply?: number;
  stale?: number;
  has_sales_leader?: number;
}

export interface AlertOversightSummary {
  total: number;
  unfollowed: number;
  pendingAdminRead: number;
  leaderPendingReply: number;
  stale: number;
}

export interface SalesAccountabilityRow {
  salesUserId: number | null;
  salesName: string;
  unfollowed: number;
  maxStaleDays: number;
  followed: number;
  followedThisWeek: number;
  total: number;
}

export interface WeeklyAlertDigest {
  total: number;
  followed: number;
  unfollowed: number;
  pendingAdminRead: number;
  followRatePercent: number;
  topUnfollowedSales: Array<{ salesName: string; unfollowed: number }>;
}

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

export interface MerchantSummary {
  id: number;
  name: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string | null;
  lastMonthAmount: number;
  mtdAmount: number;
  dailyAvgChangePercent: number | null;
  mtdCardAmount: number;
  mtdScanAmount: number;
  cardLimit: number | null;
  scanLimit: number | null;
  cardLimitPercent: number | null;
  scanLimitPercent: number | null;
  status: MerchantInsightStatus;
  hasUnreadAlert: boolean;
  unreadAlertPeriods: Array<"week" | "month">;
}

export const MASTERCARD_LIFETIME_WARN_HKD = 1_300_000;
export const MASTERCARD_LIFETIME_ALERT_HKD = 1_600_000;
export const MASTERCARD_RANK_MIN_LIST_HKD = 1_000_000;
/** @deprecated use MASTERCARD_LIFETIME_WARN_HKD */
export const MASTERCARD_LIFETIME_HIGHLIGHT_HKD = MASTERCARD_LIFETIME_WARN_HKD;

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

export type OverseasCardScheme = "visa" | "mastercard" | "unionpay";

export interface OverseasCardMonthRankRow {
  rank: number;
  id: number;
  name: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string | null;
  totalAmount: number;
  merchantMonthTotal: number;
  /** @deprecated 旧字段名，与 merchantMonthTotal 相同 */
  merchantLastMonthTotal?: number;
  txnCount: number;
  sharePercent: number;
}

export interface OverseasCardRepeatTxn {
  id: number;
  txnTime: string;
  amount: number;
  orderNo: string | null;
}

export interface OverseasCardRepeatGroup {
  rank: number;
  merchantId: number;
  merchantName: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string | null;
  scheme: "visa" | "mastercard" | "unionpay";
  cardNo: string;
  hitCount: number;
  bandAmount: number;
  transactions: OverseasCardRepeatTxn[];
}

export interface OverseasCardLargeTxnRow {
  rank: number;
  id: number;
  merchantId: number;
  merchantName: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string | null;
  scheme: OverseasCardScheme;
  txnTime: string;
  amount: number;
  cardNo: string | null;
  orderNo: string | null;
}

export interface OverseasCardOverview {
  currentMonthRank?: {
    rankMonth: string;
    rankLimit: number;
    scopeNote: string;
    orgTotal: number;
    merchants: OverseasCardMonthRankRow[];
  };
  /** @deprecated 旧字段名 */
  lastMonthRank?: OverseasCardOverview["currentMonthRank"];
  repeatCardHits: {
    rangeLabel: string;
    start: string;
    end: string;
    groups: OverseasCardRepeatGroup[];
  };
  largeTransactions: {
    rangeLabel: string;
    start: string;
    end: string;
    transactions: OverseasCardLargeTxnRow[];
  };
  thresholds: {
    repeatBandMinHkd: number;
    repeatBandMaxHkd: number;
    repeatMinTxnCount: number;
    largeTxnMinHkd: number;
  };
}

export interface PeriodBucket {
  label: string;
  amount: number;
  count: number;
}

export interface Transaction {
  id: number;
  txn_name: string;
  txn_time: string;
  amount: number;
  detail: string | null;
}
