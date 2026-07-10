import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatHkdWan, type MerchantListSortKey, type SalesHomeInsightSnapshot, type WeeklyAlertDigest } from "@/api/client";
import { PageLoader } from "@/components/PageLoader";
import { AppShell } from "@/components/AppShell";
import { HomeEntryPack, type HomeEntryItem } from "@/components/HomeEntryPack";
import { AlertDigestBanner } from "@/components/AlertDigestBanner";
import { UserHeaderActions } from "@/components/UserHeaderActions";
import { useAuth } from "@/context/AuthContext";
import { BRAND } from "@/config/branding";

interface DashboardPageProps {
  onOpenAlerts: () => void;
  onOpenMerchants: (viewSort?: MerchantListSortKey) => void;
  onOpenCardFailures: () => void;
  onOpenInsightSummary?: () => void;
  onOpenAdmin?: () => void;
  onOpenTigerTeam?: () => void;
  onOpenLeaderTeam?: () => void;
  onOpenUserCenter?: () => void;
}

interface MonthStat {
  year: number;
  month: number;
  label: string;
  chartLabel: string;
  totalAmount: number;
  txnCount: number;
  merchantCount: number;
  isCurrent: boolean;
  weeks: Array<{ label: string; totalAmount: number; txnCount: number }>;
}

const chartTooltipStyle = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
  fontSize: 13,
};

const MONTH_BAR_THEMES = [
  { id: "monthBar0", stroke: "#93c5fd", light: "#eff6ff", mid: "#93c5fd", dark: "#60a5fa" },
  { id: "monthBar1", stroke: "#60a5fa", light: "#dbeafe", mid: "#60a5fa", dark: "#3b82f6" },
  { id: "monthBar2", stroke: "#2563eb", light: "#bfdbfe", mid: "#3b82f6", dark: "#2563eb" },
] as const;

export function DashboardPage({
  onOpenAlerts,
  onOpenMerchants,
  onOpenCardFailures,
  onOpenInsightSummary,
  onOpenAdmin,
  onOpenTigerTeam,
  onOpenLeaderTeam,
  onOpenUserCenter,
}: DashboardPageProps) {
  const { user } = useAuth();
  const [overview, setOverview] = useState({
    merchantCount: 0,
    activeAlerts: 0,
    unreadAlerts: 0,
    totalAlerts: 0,
    transactionFailures: { merchantCount: 0, failureCount: 0, days: 3, rangeLabel: "" },
    monthlyStats: [] as MonthStat[],
    tigerTeam: undefined as
      | { salesCount: number; unreadAlerts: number; salesWithUnread: number }
      | undefined,
    leaderTeam: undefined as
      | { salesCount: number; unreadAlerts: number; salesWithUnread: number }
      | undefined,
    alertDigest: undefined as WeeklyAlertDigest | undefined,
    homeInsight: undefined as SalesHomeInsightSnapshot | undefined,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<typeof overview>("/stats/overview")
      .then(setOverview)
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(
    () =>
      overview.monthlyStats.map((m) => ({
        label: m.chartLabel,
        amountWan: Math.round((m.totalAmount / 10000) * 100) / 100,
        txnCount: m.txnCount,
        merchantCount: m.merchantCount,
        isCurrent: m.isCurrent,
      })),
    [overview.monthlyStats]
  );

  const homeEntries = useMemo((): HomeEntryItem[] => {
    const insight = overview.homeInsight?.insightSummary;
    const attentionCount = insight
      ? insight.newSilentCount +
        insight.decliningCount +
        (overview.homeInsight?.unreadAlertMerchantCount ?? 0)
      : 0;

    const items: HomeEntryItem[] = [
      {
        key: "alerts",
        iconKind: "alerts",
        iconTone: "amber",
        cardClassName: `home-entry-card home-entry-card--alerts ${overview.unreadAlerts > 0 ? "has-unread" : ""}`,
        title: "交易預警",
        description: "週環比、月環比異常商戶",
        packQuantity: String(overview.unreadAlerts > 0 ? overview.unreadAlerts : overview.totalAlerts),
        packLabel: "預警",
        unreadDot: overview.unreadAlerts > 0,
        footer: (
          <div className="home-entry-stats">
            {overview.unreadAlerts > 0 ? (
              <span className="home-entry-badge">{overview.unreadAlerts} 條未跟進</span>
            ) : overview.totalAlerts > 0 ? (
              <span className="home-entry-badge muted-badge">已全部已跟進</span>
            ) : (
              <span className="home-entry-badge muted-badge">暫無預警</span>
            )}
            {overview.totalAlerts > 0 && (
              <span className="home-entry-meta">共 {overview.totalAlerts} 條</span>
            )}
          </div>
        ),
        onSelect: onOpenAlerts,
      },
      {
        key: "merchants",
        iconKind: "merchants",
        iconTone: "blue",
        cardClassName: "home-entry-card home-entry-card--merchants",
        title: user?.role === "admin" ? "全部商戶" : "我的商戶",
        description: user?.role === "admin" ? "全部商戶上月交易額排名" : "上月交易額排名與明細",
        packQuantity: String(overview.merchantCount),
        packLabel: "商戶",
        footer: (
          <span className="home-entry-meta home-entry-meta-lg">{overview.merchantCount} 家商戶</span>
        ),
        onSelect: onOpenMerchants,
      },
      {
        key: "failures",
        iconKind: "failures",
        iconTone: "rose",
        cardClassName: `home-entry-card home-entry-card--card-fail ${overview.transactionFailures.failureCount > 0 ? "has-unread" : ""}`,
        title: "交易失敗",
        description: "近 3 日（不含今天）失敗訂單，按商戶失敗次數排名",
        packQuantity: String(overview.transactionFailures.failureCount),
        packLabel: "失敗",
        unreadDot: overview.transactionFailures.failureCount > 0,
        footer: (
          <div className="home-entry-stats">
            {overview.transactionFailures.failureCount > 0 ? (
              <span className="home-entry-badge card-fail-badge">
                {overview.transactionFailures.failureCount} 筆 ·{" "}
                {overview.transactionFailures.merchantCount} 家商戶
              </span>
            ) : (
              <span className="home-entry-badge muted-badge">近3日（不含今天）無失敗</span>
            )}
          </div>
        ),
        onSelect: onOpenCardFailures,
      },
    ];

    if (user?.role === "sales" && onOpenInsightSummary) {
      items.push({
        key: "summary",
        iconKind: "summary",
        iconTone: "violet",
        cardClassName: `home-entry-card home-entry-card--summary ${attentionCount > 0 ? "has-unread" : ""}`,
        title: "摘要",
        description: "本月交易額、日均環比與商户狀態概覽",
        packQuantity: String(attentionCount > 0 ? attentionCount : insight?.activeMerchantCount ?? 0),
        packLabel: "摘要",
        unreadDot: attentionCount > 0,
        footer: overview.homeInsight ? (
          <div className="home-entry-stats">
            <span className="home-entry-meta home-entry-meta-lg">
              新沉默 {insight?.newSilentCount ?? 0} · 下跌中 {insight?.decliningCount ?? 0}
            </span>
          </div>
        ) : (
          <span className="home-entry-meta muted">點擊查看本月摘要</span>
        ),
        onSelect: onOpenInsightSummary,
      });
    }

    if (user?.role === "admin" && onOpenTigerTeam) {
      items.push({
        key: "tiger",
        iconKind: "tiger",
        iconTone: "green",
        cardClassName: `home-entry-card home-entry-card--tiger ${(overview.tigerTeam?.unreadAlerts ?? 0) > 0 ? "has-unread" : ""}`,
        title: "飛虎隊",
        description: "各銷售三個月概覽與預警跟進",
        packQuantity: String(overview.tigerTeam?.salesCount ?? 0),
        packLabel: "銷售",
        unreadDot: (overview.tigerTeam?.unreadAlerts ?? 0) > 0,
        footer: (
          <div className="home-entry-stats">
            {overview.tigerTeam && overview.tigerTeam.unreadAlerts > 0 ? (
              <span className="home-entry-badge">
                {overview.tigerTeam.unreadAlerts} 條未跟進 · {overview.tigerTeam.salesWithUnread} 人待跟進
              </span>
            ) : (
              <span className="home-entry-badge muted-badge">
                {overview.tigerTeam?.salesCount ?? 0} 位銷售
              </span>
            )}
          </div>
        ),
        onSelect: onOpenTigerTeam,
      });
    }

    if (user?.role === "leader" && onOpenLeaderTeam) {
      items.push({
        key: "leader-team",
        iconKind: "team",
        iconTone: "green",
        cardClassName: `home-entry-card home-entry-card--tiger ${(overview.leaderTeam?.unreadAlerts ?? 0) > 0 ? "has-unread" : ""}`,
        title: "我的團隊",
        description: "團隊銷售交易額與預警概覽",
        packQuantity: String(overview.leaderTeam?.salesCount ?? 0),
        packLabel: "團隊",
        unreadDot: (overview.leaderTeam?.unreadAlerts ?? 0) > 0,
        footer: (
          <div className="home-entry-stats">
            {overview.leaderTeam && overview.leaderTeam.unreadAlerts > 0 ? (
              <span className="home-entry-badge">
                {overview.leaderTeam.unreadAlerts} 條未跟進 · {overview.leaderTeam.salesWithUnread} 人待跟進
              </span>
            ) : (
              <span className="home-entry-badge muted-badge">
                {overview.leaderTeam?.salesCount ?? 0} 位銷售
              </span>
            )}
          </div>
        ),
        onSelect: onOpenLeaderTeam,
      });
    }

    return items;
  }, [
    overview,
    user?.role,
    onOpenAlerts,
    onOpenMerchants,
    onOpenCardFailures,
    onOpenInsightSummary,
    onOpenTigerTeam,
    onOpenLeaderTeam,
  ]);

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
      actions={<UserHeaderActions onOpenAdmin={onOpenAdmin} onOpenUserCenter={onOpenUserCenter} />}
    >
      <HomeEntryPack entries={homeEntries} />

      {user?.role === "admin" && overview.alertDigest && overview.alertDigest.total > 0 ? (
        <AlertDigestBanner digest={overview.alertDigest} onOpenAlerts={onOpenAlerts} />
      ) : null}

      <section className="panel panel-monthly">
        <div className="panel-intro">
          <h2 className="panel-title">月度交易概覽</h2>
          <p className="panel-desc panel-desc-tight">近三個自然月交易額、商戶數與週度明細</p>
        </div>
        {loading ? (
          <PageLoader block />
        ) : (
          <>
            <div className="monthly-grid">
              {overview.monthlyStats.map((m) => (
                <div
                  key={`${m.year}-${m.month}`}
                  className={`month-block ${m.isCurrent ? "current-month" : ""}`}
                >
                  <div className="month-block-head">
                    <span className="month-block-title">{m.label}</span>
                    <span className="month-block-amount">
                      {formatHkdWan(m.totalAmount / 10000)}
                    </span>
                    <span className="month-block-meta">
                      {m.merchantCount} 家商戶 · {m.txnCount.toLocaleString()} 筆
                    </span>
                  </div>
                  {m.weeks.length > 0 && (
                    <ul className="week-breakdown">
                      {m.weeks.map((w) => (
                        <li key={w.label}>
                          <span>{w.label}</span>
                          <span>{formatHkdWan(w.totalAmount / 10000)}</span>
                          <span className="week-cnt">{w.txnCount} 筆</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {chartData.length > 0 && (
              <div className="monthly-chart">
                <h3 className="monthly-chart-title">近三月交易額對比</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 32, right: 12, left: 4, bottom: 4 }}
                    barCategoryGap="32%"
                  >
                    <defs>
                      {MONTH_BAR_THEMES.map((theme) => (
                        <linearGradient key={theme.id} id={theme.id} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={theme.light} />
                          <stop offset="55%" stopColor={theme.mid} />
                          <stop offset="100%" stopColor={theme.dark} />
                        </linearGradient>
                      ))}
                      <filter id="monthBarShadow" x="-30%" y="-20%" width="160%" height="140%">
                        <feDropShadow dx="0" dy="3" stdDeviation="2" floodColor="#334155" floodOpacity="0.16" />
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}萬`}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number) => [formatHkdWan(value), "交易額"]}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload as (typeof chartData)[0] | undefined;
                        return item
                          ? `${label} · ${item.merchantCount} 家商戶 · ${item.txnCount.toLocaleString()} 筆`
                          : label;
                      }}
                    />
                    <Bar
                      dataKey="amountWan"
                      name="交易額"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={65}
                      filter="url(#monthBarShadow)"
                    >
                      {chartData.map((entry, index) => {
                        const theme = MONTH_BAR_THEMES[index % MONTH_BAR_THEMES.length];
                        return (
                          <Cell
                            key={entry.label}
                            fill={`url(#${theme.id})`}
                            stroke={theme.stroke}
                            strokeWidth={1}
                          />
                        );
                      })}
                      <LabelList
                        dataKey="amountWan"
                        position="top"
                        formatter={(v: number) => `${v.toFixed(2)}萬`}
                        style={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="monthly-chart-legend">
                  {chartData.map((entry, index) => {
                    const theme = MONTH_BAR_THEMES[index % MONTH_BAR_THEMES.length];
                    return (
                      <span key={entry.label} className="monthly-chart-legend-item">
                        <span className="legend-dot" style={{ background: theme.dark }} />
                        {entry.label}
                        {entry.isCurrent ? "（當月）" : ""}
                      </span>
                    );
                  })}
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
