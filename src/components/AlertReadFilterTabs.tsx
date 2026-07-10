import type { Alert } from "@/api/client";

export type AlertStatusFilter =
  | ""
  | "unread"
  | "read"
  | "admin_read"
  | "leader_replied"
  | "pending_admin_read"
  | "leader_pending_reply"
  | "stale";

interface AlertFilterCounts {
  total: number;
  unfollowed: number;
  followed: number;
  adminRead: number;
  leaderReplied: number;
}

interface AlertReadFilterTabsProps {
  statusFilter: AlertStatusFilter;
  onStatusFilterChange: (value: AlertStatusFilter) => void;
  counts: AlertFilterCounts;
  showAdminRead?: boolean;
  showLeaderReply?: boolean;
}

export function countAlertFilterState(
  alerts: Alert[],
  opts?: { leaderUserId?: number }
): AlertFilterCounts {
  const leaderUserId = opts?.leaderUserId;
  let unfollowed = 0;
  let followed = 0;
  let adminRead = 0;
  let leaderReplied = 0;

  for (const a of alerts) {
    if (!a.acknowledged) unfollowed++;
    else followed++;
    if (a.admin_read) adminRead++;
    if (
      a.has_leader_reply &&
      a.sales_user_id != null &&
      a.sales_user_id !== leaderUserId
    ) {
      leaderReplied++;
    }
  }

  return { total: alerts.length, unfollowed, followed, adminRead, leaderReplied };
}

export function filterAlertsByStatus(alerts: Alert[], statusFilter: AlertStatusFilter): Alert[] {
  if (statusFilter === "unread") return alerts.filter((a) => !a.acknowledged);
  if (statusFilter === "read") return alerts.filter((a) => !!a.acknowledged);
  if (statusFilter === "admin_read") return alerts.filter((a) => !!a.admin_read);
  if (statusFilter === "leader_replied") return alerts.filter((a) => !!a.has_leader_reply);
  if (statusFilter === "pending_admin_read") {
    return alerts.filter(
      (a) =>
        !!(
          a.pending_admin_read ??
          (a.acknowledged &&
            !a.admin_read &&
            (!a.has_sales_leader || !!a.has_leader_reply))
        )
    );
  }
  if (statusFilter === "leader_pending_reply") {
    return alerts.filter((a) => !!a.leader_pending_reply);
  }
  if (statusFilter === "stale") {
    return alerts.filter((a) => !!a.stale);
  }
  return alerts;
}

/** @deprecated use countAlertFilterState */
export function countAlertReadState(alerts: Array<{ acknowledged: number }>) {
  const unfollowed = alerts.filter((a) => !a.acknowledged).length;
  return {
    unread: unfollowed,
    read: alerts.length - unfollowed,
    total: alerts.length,
  };
}

/** @deprecated use filterAlertsByStatus */
export function filterAlertsByRead<T extends { acknowledged: number }>(
  alerts: T[],
  readFilter: "" | "unread" | "read"
): T[] {
  if (readFilter === "unread") return alerts.filter((a) => !a.acknowledged);
  if (readFilter === "read") return alerts.filter((a) => !!a.acknowledged);
  return alerts;
}

export function AlertReadFilterTabs({
  statusFilter,
  onStatusFilterChange,
  counts,
  showAdminRead = false,
  showLeaderReply = false,
}: AlertReadFilterTabsProps) {
  const tabs: Array<[AlertStatusFilter, string, number]> = [
    ["", "全部", counts.total],
    ["unread", "未跟進", counts.unfollowed],
    ["read", "已跟進", counts.followed],
  ];
  if (showAdminRead) {
    tabs.push(["admin_read", "管理已閱", counts.adminRead]);
  }
  if (showLeaderReply) {
    tabs.push(["leader_replied", "主管已回覆", counts.leaderReplied]);
  }

  return (
    <div className="tabs tabs-secondary tabs-scroll">
      {tabs.map(([value, label, count]) => (
        <button
          key={value || "all-status"}
          type="button"
          className={`tab${statusFilter === value ? " active" : ""}`}
          onClick={() => onStatusFilterChange(value)}
        >
          {label} ({count})
        </button>
      ))}
    </div>
  );
}
