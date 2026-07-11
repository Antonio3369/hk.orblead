import { useEffect, useState } from "react";
import {
  api,
  formatChangePercent,
  formatHkd,
  type LeaderTeamOverview,
  type MerchantListSortKey,
  type SalesListSortKey,
  type TigerTeamSalesRow,
} from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { LeaderDashboardPanel } from "@/components/LeaderDashboardPanel";
import { LeaderTeamRankingsPanel } from "@/components/LeaderTeamRankingsPanel";
import { PageLoader } from "@/components/PageLoader";
import { NeoButton } from "@/components/NeoButton";
import { BRAND } from "@/config/branding";

interface LeaderTeamPageProps {
  onOpenSales: (salesUserId: number) => void;
  onOpenMerchant: (id: number) => void;
  onOpenMerchants: (viewSort?: MerchantListSortKey) => void;
}

const SORT_BUTTONS: { value: SalesListSortKey; label: string }[] = [
  { value: "lastMonthAmount", label: "上月交易" },
  { value: "newSilent", label: "新沉默" },
  { value: "declining", label: "下跌中" },
  { value: "rising", label: "上漲" },
  { value: "unreadAlerts", label: "預警跟進" },
];

function ChangePill({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  const up = value >= 0;
  return (
    <span className={`change-pill ${up ? "up" : "down"}`} title="本月日均 vs 上月日均">
      {up ? "↑" : "↓"} {value > 0 ? "+" : ""}
      {formatChangePercent(value)}%
    </span>
  );
}

function CountBadge({ count, tone }: { count: number; tone: "rose" | "amber" | "green" | "muted" }) {
  if (count <= 0) return <span className="muted">0</span>;
  if (tone === "rose") return <span className="home-entry-badge">{count}</span>;
  if (tone === "amber") return <span className="home-entry-badge card-fail-badge">{count}</span>;
  if (tone === "green") return <span className="status-tag status-tag--green">{count}</span>;
  return <span className="muted">{count}</span>;
}

export function LeaderTeamPage({ onOpenSales, onOpenMerchant, onOpenMerchants }: LeaderTeamPageProps) {
  const [overview, setOverview] = useState<LeaderTeamOverview | null>(null);
  const [sales, setSales] = useState<TigerTeamSalesRow[]>([]);
  const [sort, setSort] = useState<SalesListSortKey>("lastMonthAmount");
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingSales, setLoadingSales] = useState(true);

  useEffect(() => {
    setLoadingOverview(true);
    api<LeaderTeamOverview>("/leader/team/overview")
      .then(setOverview)
      .finally(() => setLoadingOverview(false));
  }, []);

  useEffect(() => {
    setLoadingSales(true);
    api<{ sales: TigerTeamSalesRow[] }>(`/leader/team?sort=${sort}`)
      .then((data) => setSales(data.sales))
      .finally(() => setLoadingSales(false));
  }, [sort]);

  const teamSummary = overview?.teamSummary;
  const sortHint = SORT_BUTTONS.find((b) => b.value === sort)?.label ?? "上月交易";
  const totalUnread = sales.reduce((n, s) => n + s.unreadAlerts, 0);
  const totalSilent = sales.reduce((n, s) => n + s.newSilentCount, 0);

  const subtitle = teamSummary
    ? `${BRAND.companyName} · ${teamSummary.salesCount} 位銷售 · ${teamSummary.unreadAlerts} 條未跟進預警${
        teamSummary.salesWithUnread > 0 ? ` · ${teamSummary.salesWithUnread} 人有待處理` : ""
      }`
    : `${BRAND.companyName} · 團隊管理`;

  return (
    <AppShell title="我的團隊" subtitle={subtitle}>
      {loadingOverview ? (
        <PageLoader block />
      ) : overview?.charts ? (
        <LeaderDashboardPanel charts={overview.charts} teamSummary={overview.teamSummary} />
      ) : null}

      <section className="panel">
        <div className="panel-intro">
          <h2 className="panel-title">團隊成員</h2>
          <p className="panel-desc panel-desc-tight">
            默認按<strong>上月交易額</strong>排名 · 新沉默 {totalSilent} 家 · {totalUnread} 條未跟進預警
          </p>
        </div>
        <div className="detail-tabs sales-rank-tabs">
          {SORT_BUTTONS.map((btn) => (
            <button
              key={btn.value}
              type="button"
              className={`detail-tab ${sort === btn.value ? "active" : ""}`}
              onClick={() => setSort(btn.value)}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <p className="panel-desc panel-desc-tight muted" style={{ marginTop: 0 }}>
          當前排序：<strong>{sortHint}</strong>
        </p>
        {loadingSales ? (
          <PageLoader block />
        ) : sales.length === 0 ? (
          <p className="muted">暫無歸屬銷售，請聯繫管理員在後臺為您配置團隊成員。</p>
        ) : (
          <div className="table-wrap table-wrap--stack">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>銷售</th>
                  <th>登入名</th>
                  <th>活躍/歸屬</th>
                  <th className={sort === "lastMonthAmount" ? "sort-col-active" : undefined}>上月交易額</th>
                  <th>本月 MTD</th>
                  <th>日均環比</th>
                  <th className={sort === "newSilent" ? "sort-col-active" : undefined}>新沉默</th>
                  <th className={sort === "declining" ? "sort-col-active" : undefined}>下跌中</th>
                  <th className={sort === "rising" ? "sort-col-active" : undefined}>上漲</th>
                  <th className={sort === "unreadAlerts" ? "sort-col-active" : undefined}>未跟進預警</th>
                  <th className="data-table-actions" aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {sales.map((s, index) => (
                  <tr
                    key={s.id}
                    className={
                      s.newSilentCount > 0 || s.decliningCount > 0 || s.unreadAlerts > 0
                        ? "tiger-row--alert"
                        : undefined
                    }
                  >
                    <td data-label="排名">{index + 1}</td>
                    <td data-label="銷售">
                      <strong>{s.displayName}</strong>
                      {s.role === "leader" && (
                        <span className="role-tag role-tag--leader" style={{ marginLeft: 8 }}>
                          主管
                        </span>
                      )}
                    </td>
                    <td data-label="登入名">{s.username}</td>
                    <td data-label="活躍/歸屬">
                      <strong>{s.activeMerchantCount}</strong>
                      <span className="muted"> / {s.assignedMerchantCount}</span>
                    </td>
                    <td
                      className={`amount-cell ${sort === "lastMonthAmount" ? "sort-col-active" : ""}`}
                      data-label="上月交易額"
                      title={s.lastMonthLabel}
                    >
                      {formatHkd(s.lastMonthAmount)}
                    </td>
                    <td className="amount-cell" data-label="本月 MTD" title={s.mtdLabel}>
                      {formatHkd(s.mtdAmount)}
                    </td>
                    <td data-label="日均環比">
                      <ChangePill value={s.mtdDailyAvgChangePercent} />
                    </td>
                    <td className={sort === "newSilent" ? "sort-col-active" : undefined} data-label="新沉默">
                      <CountBadge count={s.newSilentCount} tone="rose" />
                    </td>
                    <td className={sort === "declining" ? "sort-col-active" : undefined} data-label="下跌中">
                      <CountBadge count={s.decliningCount} tone="amber" />
                    </td>
                    <td className={sort === "rising" ? "sort-col-active" : undefined} data-label="上漲">
                      <CountBadge count={s.risingCount} tone="green" />
                    </td>
                    <td className={sort === "unreadAlerts" ? "sort-col-active" : undefined} data-label="未跟進預警">
                      {s.unreadAlerts > 0 ? (
                        <span className="home-entry-badge">{s.unreadAlerts} 未跟進</span>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td className="data-table-actions" data-label="操作">
                      <NeoButton size="xs" onClick={() => onOpenSales(s.id)}>
                        查看 →
                      </NeoButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!loadingOverview && overview?.charts ? (
        <LeaderTeamRankingsPanel
          charts={overview.charts}
          onOpenMerchants={onOpenMerchants}
          onOpenMerchant={onOpenMerchant}
          onOpenLeaderTeamSales={onOpenSales}
        />
      ) : null}
    </AppShell>
  );
}
