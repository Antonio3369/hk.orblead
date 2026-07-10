import { followUpItemKey, type FollowUpLatest } from "@/api/followUp";
import { type Alert, formatChangePercent } from "@/api/client";
import { FollowUpPanel } from "@/components/FollowUpPanel";
import { PageLoader } from "@/components/PageLoader";
import { AlertProgressSteps } from "@/components/AlertProgressSteps";
import {
  AlertReadFilterTabs,
  filterAlertsByStatus,
  countAlertFilterState,
  type AlertStatusFilter,
} from "@/components/AlertReadFilterTabs";

const ALERT_PERIOD_LABEL = { week: "週", month: "月" } as const;

interface AlertListSectionProps {
  alerts: Alert[];
  statusFilter: AlertStatusFilter;
  onStatusFilterChange: (value: AlertStatusFilter) => void;
  loading?: boolean;
  currentUserId?: number;
  showAdminRepliedTab?: boolean;
  showLeaderReadTab?: boolean;
  showSalesTag?: boolean;
  merchantActionLabel?: string;
  onOpenMerchant: (merchantId: number) => void;
  followUpLatest: Record<string, FollowUpLatest>;
  onFollowUpUpdated: () => void;
  onAcknowledged?: () => void;
  onLeaderRead?: () => void;
  emptyUnreadMessage?: string;
  emptyDefaultMessage?: string;
  showFollowUpHint?: boolean;
  showProgressSteps?: boolean;
  showLeaderProgress?: boolean;
}

export function AlertListSection({
  alerts,
  statusFilter,
  onStatusFilterChange,
  loading,
  currentUserId,
  showAdminRepliedTab = false,
  showLeaderReadTab = false,
  showSalesTag = false,
  merchantActionLabel = "查看明細",
  onOpenMerchant,
  followUpLatest,
  onFollowUpUpdated,
  onAcknowledged,
  onLeaderRead,
  emptyUnreadMessage = "暫無未跟進預警",
  emptyDefaultMessage = "暫無預警",
  showFollowUpHint = false,
  showProgressSteps = false,
  showLeaderProgress = false,
}: AlertListSectionProps) {
  const counts = countAlertFilterState(alerts, { leaderUserId: currentUserId });
  const filtered = filterAlertsByStatus(alerts, statusFilter);

  return (
    <>
      <AlertReadFilterTabs
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        counts={counts}
        showAdminRead={showAdminRepliedTab}
        showLeaderReply={showLeaderReadTab}
      />
      {loading ? (
        <PageLoader block />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✓</div>
          <p>{statusFilter === "unread" ? emptyUnreadMessage : emptyDefaultMessage}</p>
          {showFollowUpHint && (
            <p className="muted" style={{ marginTop: 8, fontSize: "0.85rem" }}>
              提交跟進記錄後，該條預警將自動標為已跟進
            </p>
          )}
        </div>
      ) : (
        <ul className="alert-list">
          {filtered.map((a) => {
            return (
              <li
                key={a.id}
                data-list-anchor-merchant={a.merchant_id}
                className={`alert-item ${a.acknowledged ? "acked read" : "unread"}`}
              >
                <div className="alert-item-header">
                  <div className="alert-item-badges">
                    <span className={`alert-read-badge ${a.acknowledged ? "read" : "unread"}`}>
                      {a.acknowledged ? "已跟進" : "未跟進"}
                    </span>
                    {!!a.admin_read && (
                      <span className="alert-status-badge alert-status-badge--admin">管理已閱</span>
                    )}
                    {!!a.has_leader_reply && !!a.has_sales_leader && (
                      <span className="alert-status-badge alert-status-badge--leader">主管已回覆</span>
                    )}
                    <span className={`badge ${a.period}`}>
                      {a.period === "week" || a.period === "month"
                        ? ALERT_PERIOD_LABEL[a.period]
                        : a.period}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onOpenMerchant(a.merchant_id)}
                  >
                    {a.merchant_name}
                  </button>
                  {showSalesTag && (
                    <span className="alert-sales-tag" title="歸屬銷售">
                      銷售 {a.sales_name ?? "待分配"}
                    </span>
                  )}
                  <span className={`change-pill ${a.change_percent < 0 ? "down" : "up"}`}>
                    {a.change_percent > 0 ? "+" : ""}
                    {formatChangePercent(a.change_percent)}%
                  </span>
                </div>
                {showProgressSteps && (
                  <AlertProgressSteps
                    alert={a}
                    showLeaderStep={showLeaderProgress && !!a.has_sales_leader}
                  />
                )}
                <p className="alert-msg">{a.message}</p>
                {a.ref_key && (
                  <div className="alert-follow-up">
                    <FollowUpPanel
                      merchantId={a.merchant_id}
                      merchantName={a.merchant_name}
                      type="alert"
                      refKey={a.ref_key}
                      ownerSalesUserId={a.sales_user_id}
                      canMarkAdminRead={
                        !!a.acknowledged && (!a.has_sales_leader || !!a.has_leader_reply)
                      }
                      latest={followUpLatest[followUpItemKey(a.merchant_id, "alert", a.ref_key)]}
                      onUpdated={onFollowUpUpdated}
                      onAcknowledged={onAcknowledged}
                      onLeaderRead={onLeaderRead}
                    />
                  </div>
                )}
                <div className="alert-actions">
                  <button type="button" className="btn btn-sm" onClick={() => onOpenMerchant(a.merchant_id)}>
                    {merchantActionLabel}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export { countAlertFilterState as countAlertReadState };
