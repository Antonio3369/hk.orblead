import { useEffect, useState } from "react";
import {
  api,
  formatChangePercent,
  formatHkd,
  type AdminDashboardCharts,
  type MerchantListSortKey,
  type PersonalDashboardCharts,
  type SalesHomeInsightSnapshot,
  type WeeklyAlertDigest,
} from "@/api/client";
import { PageLoader } from "@/components/PageLoader";
import { AppShell } from "@/components/AppShell";
import { AlertDigestBanner } from "@/components/AlertDigestBanner";
import { AdminDashboardPanel } from "@/components/AdminDashboardPanel";
import { PersonalDashboardPanel } from "@/components/PersonalDashboardPanel";
import { useAuth } from "@/context/AuthContext";
import { BRAND } from "@/config/branding";
import { LEADER_PERSONAL_SCOPE_HINT, merchantsNavLabel } from "@/config/navigation";
import type { OpenMerchantsParams } from "@/utils/openMerchants";

interface DashboardPageProps {
  onOpenAlerts: () => void;
  onOpenMerchants: (params?: MerchantListSortKey | OpenMerchantsParams) => void;
  onOpenMerchant?: (id: number) => void;
  onOpenTigerTeam?: () => void;
  onOpenTigerTeamSales?: (salesUserId: number) => void;
}

function ChangePill({ value, title }: { value: number | null; title: string }) {
  if (value === null) {
    return <span className="change-pill muted">環比 —</span>;
  }
  const up = value >= 0;
  return (
    <span className={`change-pill ${up ? "up" : "down"}`} title={title}>
      {up ? "↑" : "↓"} {value > 0 ? "+" : ""}
      {formatChangePercent(value)}%
    </span>
  );
}

export function DashboardPage({
  onOpenAlerts,
  onOpenMerchants,
  onOpenMerchant,
  onOpenTigerTeam,
  onOpenTigerTeamSales,
}: DashboardPageProps) {
  const { user } = useAuth();
  const [overview, setOverview] = useState({
    merchantCount: 0,
    unreadAlerts: 0,
    totalAlerts: 0,
    transactionFailures: { merchantCount: 0, failureCount: 0, days: 3, rangeLabel: "" },
    adminCharts: undefined as AdminDashboardCharts | undefined,
    personalCharts: undefined as PersonalDashboardCharts | undefined,
    alertDigest: undefined as WeeklyAlertDigest | undefined,
    homeInsight: undefined as SalesHomeInsightSnapshot | undefined,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    api<typeof overview>("/stats/overview")
      .then(setOverview)
      .catch((err: Error) => setLoadError(err.message || "載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  const isAdmin = user?.role === "admin";
  const isLeader = user?.role === "leader";
  const isPersonalDashboard = user?.role === "sales" || isLeader;
  const teamMerchantsLabel = isLeader ? merchantsNavLabel("leader") : "我的商戶";

  return (
    <AppShell
      title="工作台"
      subtitle={
        user?.role === "admin"
          ? `${BRAND.companyName} · 管理員`
          : user?.role === "leader"
            ? `${BRAND.companyName} · 主管 · ${user?.displayName}`
            : `${BRAND.companyName} · ${user?.displayName}`
      }
    >
      {isAdmin && overview.alertDigest && overview.alertDigest.total > 0 ? (
        <AlertDigestBanner digest={overview.alertDigest} onOpenAlerts={onOpenAlerts} />
      ) : null}

      {loadError ? (
        <section className="panel">
          <p className="muted">工作台數據載入失敗：{loadError}</p>
        </section>
      ) : null}

      {loading ? (
        <PageLoader block />
      ) : isAdmin && overview.adminCharts ? (
        <AdminDashboardPanel
          charts={overview.adminCharts}
          unreadAlerts={overview.unreadAlerts}
          totalAlerts={overview.totalAlerts}
          merchantCount={overview.merchantCount}
          transactionFailures={overview.transactionFailures}
          onOpenAlerts={onOpenAlerts}
          onOpenMerchants={onOpenMerchants}
          onOpenMerchant={(id) => onOpenMerchant?.(id)}
          onOpenTigerTeamSales={(id) => onOpenTigerTeamSales?.(id)}
          onOpenTigerTeam={() => onOpenTigerTeam?.()}
        />
      ) : isPersonalDashboard ? (
        <>
          {overview.homeInsight ? (
            <section className="panel dashboard-hero">
              <div className="dashboard-hero-head">
                <div>
                  <p className="dashboard-hero-kicker">
                    {isLeader ? "本人商戶 · 交易概覽" : "我的商戶 · 交易概覽"}
                  </p>
                  <h2 className="panel-title dashboard-hero-title">
                    {isLeader ? "本月累計交易額（本人）" : "本月累計交易額"}
                  </h2>
                  <p className="panel-desc panel-desc-tight">{overview.homeInsight.mtdLabel}</p>
                </div>
                {isLeader ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-brutalist"
                    title={`查看${teamMerchantsLabel}`}
                    onClick={() => onOpenMerchants()}
                  >
                    {teamMerchantsLabel} →
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm btn-brutalist" onClick={() => onOpenMerchants()}>
                    我的商戶 →
                  </button>
                )}
              </div>
              <div className="dashboard-hero-metrics">
                <p className="dashboard-hero-amount">{formatHkd(overview.homeInsight.mtdAmount)}</p>
                <ChangePill value={overview.homeInsight.dailyAvgChangePercent} title="本月日均 vs 上月日均" />
              </div>
              <p className="dashboard-hero-meta">
                活躍 <strong>{overview.homeInsight.insightSummary.activeMerchantCount}</strong> 家 · 歸屬{" "}
                <strong>{overview.homeInsight.insightSummary.assignedMerchantCount}</strong> 家
                {isLeader ? "（本人）" : null}
              </p>
            </section>
          ) : null}

          {isLeader ? (
            <p className="dashboard-scope-note panel-desc panel-desc-tight">
              本頁圖表與統計為<strong>本人</strong>歸屬商戶；團隊合計與成員業績見「我的團隊」，商戶明細見「
              {teamMerchantsLabel}」。
            </p>
          ) : null}

          <section className="panel dashboard-overview">
            <div className="dashboard-stat-grid">
              <button
                type="button"
                className="dashboard-stat-card"
                title={isLeader ? `${LEADER_PERSONAL_SCOPE_HINT}；列表為團隊範圍` : undefined}
                onClick={onOpenAlerts}
              >
                <span className="dashboard-stat-label">{isLeader ? "交易預警（本人）" : "交易預警"}</span>
                <span className="dashboard-stat-value">{overview.unreadAlerts}</span>
                <span className="dashboard-stat-meta">
                  未跟進 · 共 {overview.totalAlerts} 條{isLeader ? " · 列表含團隊" : ""}
                </span>
              </button>
              {isLeader ? (
                <div
                  className="dashboard-stat-card dashboard-stat-card--static dashboard-stat-card--link"
                  role="button"
                  tabIndex={0}
                  title={LEADER_PERSONAL_SCOPE_HINT}
                  onClick={() => onOpenMerchants({ salesFilter: "self" })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenMerchants({ salesFilter: "self" });
                    }
                  }}
                >
                  <span className="dashboard-stat-label">本人商戶</span>
                  <span className="dashboard-stat-value">{overview.merchantCount}</span>
                  <span className="dashboard-stat-meta">家 · 點擊查看本人列表</span>
                </div>
              ) : (
                <button type="button" className="dashboard-stat-card" onClick={() => onOpenMerchants()}>
                  <span className="dashboard-stat-label">我的商戶</span>
                  <span className="dashboard-stat-value">{overview.merchantCount}</span>
                  <span className="dashboard-stat-meta">家商戶</span>
                </button>
              )}
              <div
                className="dashboard-stat-card dashboard-stat-card--static"
                title={
                  isLeader
                    ? `${LEADER_PERSONAL_SCOPE_HINT}；團隊見側欄「交易失敗」`
                    : undefined
                }
              >
                <span className="dashboard-stat-label">{isLeader ? "交易失敗（本人）" : "交易失敗"}</span>
                <span className="dashboard-stat-value">{overview.transactionFailures.failureCount}</span>
                <span className="dashboard-stat-meta">
                  近3日 · {overview.transactionFailures.merchantCount} 家商戶
                  {isLeader ? " · 團隊見側欄" : ""}
                </span>
              </div>
            </div>
          </section>

          {overview.personalCharts ? (
            <PersonalDashboardPanel
              charts={overview.personalCharts}
              homeInsight={overview.homeInsight}
              isLeader={isLeader}
              onOpenMerchants={onOpenMerchants}
            />
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
