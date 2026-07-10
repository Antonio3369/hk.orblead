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
