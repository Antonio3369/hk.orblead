import { formatHkdWan, type LeaderDashboardCharts } from "@/api/client";
import { DashboardChartsCore } from "@/components/DashboardChartsCore";

interface LeaderDashboardPanelProps {
  charts: LeaderDashboardCharts;
  teamSummary?: {
    salesCount: number;
    unreadAlerts: number;
    salesWithUnread: number;
  };
}

export function LeaderDashboardPanel({ charts, teamSummary }: LeaderDashboardPanelProps) {
  return (
    <>
      {teamSummary ? (
        <section className="panel dashboard-overview">
          <div className="panel-intro">
            <h2 className="panel-title">團隊總覽</h2>
            <p className="panel-desc panel-desc-tight">
              {charts.merchantInsight.mtdLabel} · 共 {charts.merchantInsight.totalAssigned.toLocaleString()} 家歸屬商戶
            </p>
          </div>
          <div className="dashboard-stat-grid">
            <div className="dashboard-stat-card dashboard-stat-card--static">
              <span className="dashboard-stat-label">團隊銷售</span>
              <span className="dashboard-stat-value">{teamSummary.salesCount}</span>
              <span className="dashboard-stat-meta">位成員</span>
            </div>
            <div className="dashboard-stat-card dashboard-stat-card--static">
              <span className="dashboard-stat-label">未跟進預警</span>
              <span className="dashboard-stat-value">{teamSummary.unreadAlerts}</span>
              <span className="dashboard-stat-meta">
                {teamSummary.salesWithUnread > 0 ? `${teamSummary.salesWithUnread} 人有待處理` : "團隊合計"}
              </span>
            </div>
            <div className="dashboard-stat-card dashboard-stat-card--static">
              <span className="dashboard-stat-label">上月團隊交易</span>
              <span className="dashboard-stat-value">
                {formatHkdWan(charts.salesRanking.orgLastMonthTotal / 10000)}
              </span>
              <span className="dashboard-stat-meta">{charts.salesRanking.rankMonth}合計</span>
            </div>
          </div>
        </section>
      ) : null}

      <DashboardChartsCore charts={charts} monthlyTrendSubtitle="近三個自然月團隊交易額" />
    </>
  );
}
