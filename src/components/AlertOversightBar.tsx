import type { AlertOversightSummary } from "@/api/client";
import type { AlertStatusFilter } from "@/components/AlertReadFilterTabs";

interface AlertOversightBarProps {
  summary: AlertOversightSummary;
  activeFilter: AlertStatusFilter;
  onFilterChange: (filter: AlertStatusFilter) => void;
}

const CARDS: Array<{
  key: AlertStatusFilter;
  label: string;
  hint: string;
  tone: "warn" | "info" | "rose" | "danger";
  count: (s: AlertOversightSummary) => number;
}> = [
  {
    key: "unread",
    label: "未跟進",
    hint: "銷售尚未提交跟進",
    tone: "warn",
    count: (s) => s.unfollowed,
  },
  {
    key: "leader_pending_reply",
    label: "待主管回覆",
    hint: "銷售已跟進，等待主管提交回覆",
    tone: "rose",
    count: (s) => s.leaderPendingReply,
  },
  {
    key: "pending_admin_read",
    label: "待你閱",
    hint: "銷售已跟進、主管已回覆，等待管理員查看（無需回覆）",
    tone: "info",
    count: (s) => s.pendingAdminRead,
  },
  {
    key: "stale",
    label: "超 5 天",
    hint: "產生超過 5 天仍未跟進",
    tone: "danger",
    count: (s) => s.stale,
  },
];

export function AlertOversightBar({ summary, activeFilter, onFilterChange }: AlertOversightBarProps) {
  return (
    <div className="alert-oversight-bar" role="group" aria-label="預警督辦">
      {CARDS.map((card) => {
        const value = card.count(summary);
        const active = activeFilter === card.key;
        return (
          <button
            key={card.key}
            type="button"
            className={`alert-oversight-card alert-oversight-card--${card.tone}${active ? " alert-oversight-card--active" : ""}`}
            onClick={() => onFilterChange(activeFilter === card.key ? "" : card.key)}
            title={card.hint}
          >
            <span className="alert-oversight-card__value">{value}</span>
            <span className="alert-oversight-card__label">{card.label}</span>
          </button>
        );
      })}
    </div>
  );
}
