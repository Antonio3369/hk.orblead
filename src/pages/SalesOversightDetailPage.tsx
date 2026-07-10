import { useEffect, useMemo, useState } from "react";
import { api, type Alert, type SalesAccountabilityRow } from "@/api/client";
import { followUpItemKey } from "@/api/followUp";
import { AlertListSection, countAlertReadState } from "@/components/AlertListSection";
import { type AlertStatusFilter } from "@/components/AlertReadFilterTabs";
import { AppShell } from "@/components/AppShell";
import { useFollowUpLatest } from "@/components/FollowUpPanel";
import { UserHeaderActions } from "@/components/UserHeaderActions";
import { useAuth } from "@/context/AuthContext";

const ALERT_PERIOD_LABEL = { week: "週", month: "月" } as const;

export interface SalesOversightContext {
  salesUserId: number | null;
  salesName: string;
  periodFilter: "" | "week" | "month";
}

interface SalesOversightDetailPageProps {
  salesUserId: number | null;
  salesName: string;
  periodFilter: "" | "week" | "month";
  onBack: () => void;
  onOpenMerchant: (merchantId: number) => void;
  onOpenAdmin?: () => void;
  onOpenUserCenter?: () => void;
}

function oversightSalesApiPath(
  salesUserId: number | null,
  salesName: string,
  periodFilter: "" | "week" | "month"
): string {
  const params = new URLSearchParams();
  if (periodFilter) params.set("period", periodFilter);
  const base =
    salesUserId != null
      ? `/alerts/oversight/sales/${salesUserId}`
      : (() => {
          if (salesName !== "待分配") params.set("name", salesName);
          return "/alerts/oversight/sales/unassigned";
        })();
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function SalesOversightDetailPage({
  salesUserId,
  salesName,
  periodFilter,
  onBack,
  onOpenMerchant,
  onOpenAdmin,
  onOpenUserCenter,
}: SalesOversightDetailPageProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<SalesAccountabilityRow | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("unread");
  const [loading, setLoading] = useState(true);

  const load = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const data = await api<{
        sales: { userId: number | null; displayName: string };
        stats: SalesAccountabilityRow;
        alerts: Alert[];
      }>(oversightSalesApiPath(salesUserId, salesName, periodFilter));
      setStats(data.stats);
      setAlerts(data.alerts);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    scrollToTop();
    const timers = [0, 50, 150].map((ms) => window.setTimeout(scrollToTop, ms));
    const raf = requestAnimationFrame(scrollToTop);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(raf);
    };
  }, [salesUserId, salesName, periodFilter]);

  useEffect(() => {
    load();
  }, [salesUserId, salesName, periodFilter]);

  const { unread, total } = countAlertReadState(alerts);

  const followUpItems = useMemo(
    () =>
      alerts
        .filter((a) => a.ref_key)
        .map((a) => ({
          merchantId: a.merchant_id,
          type: "alert" as const,
          refKey: a.ref_key!,
        })),
    [alerts]
  );
  const { latest: followUpLatest, refresh: refreshFollowUps } = useFollowUpLatest(followUpItems);

  const periodLabel = periodFilter ? `${ALERT_PERIOD_LABEL[periodFilter]}環比` : "全部週期";

  return (
    <AppShell
      title={salesName}
      subtitle={`未跟進督辦 · ${periodLabel} · ${unread} 條待處理 / 共 ${total} 條`}
      onBack={onBack}
      backLabel="返回督辦榜"
      actions={<UserHeaderActions onOpenAdmin={onOpenAdmin} onOpenUserCenter={onOpenUserCenter} />}
    >
      <section className="panel">
        <div className="sales-oversight-detail-head">
          <div>
            <h2 className="panel-title">{salesName} · 未跟進預警</h2>
            <p className="panel-desc panel-desc-tight">
              以下為該銷售名下尚未提交跟進的預警，請逐條核對並催辦處理。
            </p>
          </div>
          {stats && stats.unfollowed > 0 ? (
            <div className="sales-oversight-detail-stats">
              <span className="sales-oversight-detail-stat sales-oversight-detail-stat--warn">
                <strong>{stats.unfollowed}</strong>
                <span>未跟進</span>
              </span>
              {stats.maxStaleDays > 0 ? (
                <span className="sales-oversight-detail-stat">
                  <strong>{stats.maxStaleDays}</strong>
                  <span>天未處理</span>
                </span>
              ) : null}
              <span className="sales-oversight-detail-stat">
                <strong>{stats.followedThisWeek}</strong>
                <span>本週已跟進</span>
              </span>
            </div>
          ) : null}
        </div>

        <AlertListSection
          alerts={alerts}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          loading={loading}
          currentUserId={user?.id}
          showAdminRepliedTab
          showLeaderReadTab={false}
          showSalesTag={false}
          showProgressSteps
          showLeaderProgress
          onOpenMerchant={onOpenMerchant}
          followUpLatest={followUpLatest}
          onFollowUpUpdated={() => {
            refreshFollowUps();
            load({ silent: true });
          }}
          onAcknowledged={() => load({ silent: true })}
          emptyUnreadMessage="該銷售暫無未跟進預警"
          emptyDefaultMessage="該銷售暫無預警"
        />
      </section>
    </AppShell>
  );
}
