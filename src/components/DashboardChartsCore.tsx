import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatHkd,
  formatHkdWan,
  type AdminMonthCompare,
  type MerchantListSortKey,
  type PersonalDashboardCharts,
} from "@/api/client";
import {
  CHART_TOOLTIP_STYLE,
  CHART_STATIC_PROPS,
  ChangePill,
  DAILY_CROSS_CHART_MARGIN,
  DAILY_CROSS_CURRENT_MONTH_COLOR,
  DAILY_CROSS_LAST_MONTH_COLOR,
  DailyCrossChartTooltip,
  DAILY_CROSS_TOOLTIP_PROPS,
  INSIGHT_BUCKET_ORDER,
  InsightMiniDonut,
} from "@/components/dashboardChartParts";

interface InsightJump {
  sort: MerchantListSortKey;
  label: string;
  count: number;
  tone: "rose" | "amber" | "green" | "blue";
}

interface DashboardChartsCoreProps {
  charts: PersonalDashboardCharts;
  monthlyTrendSubtitle?: string;
  merchantInsightFootnote?: string;
  insightJumps?: InsightJump[];
  insightJumpsHint?: string;
  insightJumpTitle?: string;
  onInsightJump?: (sort: MerchantListSortKey) => void;
}

export function DashboardChartsCore({
  charts,
  monthlyTrendSubtitle = "近三個自然月交易額",
  merchantInsightFootnote,
  insightJumps,
  insightJumpsHint,
  insightJumpTitle,
  onInsightJump,
}: DashboardChartsCoreProps) {
  const monthlyChartData = useMemo(
    () =>
      charts.monthlyTrend.map((m) => ({
        label: m.chartLabel,
        amountWan: Math.round((m.totalAmount / 10000) * 100) / 100,
        txnCount: m.txnCount,
        merchantCount: m.merchantCount,
        isCurrent: m.isCurrent,
        fullLabel: m.label,
      })),
    [charts.monthlyTrend]
  );

  const compareChartData = useMemo(
    () => [
      {
        label: charts.monthCompare.previousMonth.chartLabel,
        amountWan: Math.round((charts.monthCompare.previousMonth.totalAmount / 10000) * 100) / 100,
        side: charts.monthCompare.previousMonth,
      },
      {
        label: charts.monthCompare.lastMonth.chartLabel,
        amountWan: Math.round((charts.monthCompare.lastMonth.totalAmount / 10000) * 100) / 100,
        side: charts.monthCompare.lastMonth,
      },
    ],
    [charts.monthCompare]
  );

  const dailyCrossData = useMemo(
    () =>
      charts.dailyMonthCross.points.map((p) => ({
        label: p.label,
        current: p.currentAmount,
        last: p.lastAmount,
        currentTxnCount: p.currentTxnCount,
        lastTxnCount: p.lastTxnCount,
      })),
    [charts.dailyMonthCross.points]
  );

  return (
    <>
      <div className="admin-chart-duo">
        <section className="panel admin-chart-panel">
          <div className="panel-intro">
            <h2 className="panel-title">自然月環比</h2>
          </div>
          <div className="admin-compare-pills">
            <div className="admin-compare-pill-item">
              <span>總額環比</span>
              <ChangePill value={charts.monthCompare.amountChangePercent} title="上月總額 vs 上上月總額" />
            </div>
            <div className="admin-compare-pill-item">
              <span>日均環比</span>
              <ChangePill value={charts.monthCompare.dailyAvgChangePercent} title="上月日均 vs 上上月日均" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart {...CHART_STATIC_PROPS} data={compareChartData} margin={{ top: 28, right: 8, left: 4, bottom: 4 }} barCategoryGap="40%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}萬`} width={48} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(_v: number, _n, item) => [formatHkdWan((item.payload as { amountWan: number }).amountWan), "交易額"]}
                labelFormatter={(_label, payload) => {
                  const side = (payload?.[0]?.payload as { side?: AdminMonthCompare["lastMonth"] })?.side;
                  if (!side) return _label;
                  return `${side.label} · ${side.merchantCount} 家 · ${side.txnCount.toLocaleString()} 筆 · ${side.days} 天`;
                }}
              />
              <Bar dataKey="amountWan" radius={[6, 6, 0, 0]} maxBarSize={72}>
                <Cell fill="#cbd5e1" />
                <Cell fill="#2563eb" />
                <LabelList
                  dataKey="amountWan"
                  position="top"
                  formatter={(v: number) => `${v.toFixed(2)}萬`}
                  style={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel admin-chart-panel">
          <div className="panel-intro">
            <h2 className="panel-title">商戶動態分布</h2>
            <p className="panel-desc panel-desc-tight">
              {charts.merchantInsight.mtdLabel} · 對比{charts.merchantInsight.rankMonth}
            </p>
          </div>
          <div className="admin-insight-donut-grid">
            {INSIGHT_BUCKET_ORDER.map(({ key, label }) => (
              <InsightMiniDonut
                key={key}
                title={label}
                bucket={charts.merchantInsight.buckets.find((item) => item.key === key)}
              />
            ))}
          </div>
          <p className="panel-desc panel-desc-tight admin-insight-donut-foot">
            {merchantInsightFootnote ??
              `共 ${charts.merchantInsight.totalAssigned.toLocaleString()} 家歸屬商戶`}
          </p>
          {insightJumps && insightJumps.length > 0 && onInsightJump ? (
            <>
              {insightJumpsHint ? (
                <p className="panel-desc panel-desc-tight dashboard-scope-note">{insightJumpsHint}</p>
              ) : null}
              <div className="sales-home-insight-jumps sales-home-insight-jumps--compact">
              {insightJumps.map((item) => (
                <button
                  key={item.sort}
                  type="button"
                  className={`sales-home-insight-jump sales-home-insight-jump--${item.tone}`}
                  title={insightJumpTitle}
                  onClick={() => onInsightJump(item.sort)}
                >
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
              </div>
            </>
          ) : null}
        </section>
      </div>

      <section className="panel admin-chart-panel">
        <div className="panel-intro">
          <h2 className="panel-title">月度交易趨勢</h2>
          <p className="panel-desc panel-desc-tight">{monthlyTrendSubtitle}</p>
        </div>
        <div className="monthly-chart admin-line-chart">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart {...CHART_STATIC_PROPS} data={monthlyChartData} margin={{ top: 16, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}萬`}
                width={56}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(_v: number, _n, item) => [formatHkdWan((item.payload as { amountWan: number }).amountWan), "交易額"]}
                labelFormatter={(_label, payload) => {
                  const item = payload?.[0]?.payload as (typeof monthlyChartData)[0] | undefined;
                  return item
                    ? `${item.fullLabel} · ${item.merchantCount} 家商戶 · ${item.txnCount.toLocaleString()} 筆`
                    : "";
                }}
              />
              <Line
                type="monotone"
                dataKey="amountWan"
                name="交易額"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, payload } = props as {
                    cx?: number;
                    cy?: number;
                    payload?: (typeof monthlyChartData)[0];
                  };
                  if (cx == null || cy == null || !payload) return null;
                  const current = payload.isCurrent;
                  return (
                    <circle
                      key={payload.label}
                      cx={cx}
                      cy={cy}
                      r={current ? 6 : 4}
                      fill={current ? "#1d4ed8" : "#2563eb"}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel admin-chart-panel">
        <div className="panel-intro">
          <h2 className="panel-title">日交易金額 · 本月 vs 上月</h2>
          <p className="panel-desc panel-desc-tight">
            {charts.dailyMonthCross.currentMonthLabel}（截至昨日）對比 {charts.dailyMonthCross.lastMonthLabel}（1–30 日）
          </p>
        </div>
        <div className="admin-line-chart">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart {...CHART_STATIC_PROPS} data={dailyCrossData} margin={DAILY_CROSS_CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 10000)}萬`} width={48} />
              <Tooltip
                {...DAILY_CROSS_TOOLTIP_PROPS}
                content={
                  <DailyCrossChartTooltip
                    currentMonthLabel={charts.dailyMonthCross.currentMonthLabel}
                    lastMonthLabel={charts.dailyMonthCross.lastMonthLabel}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="last"
                name={charts.dailyMonthCross.lastMonthLabel}
                stroke={DAILY_CROSS_LAST_MONTH_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="current"
                name={charts.dailyMonthCross.currentMonthLabel}
                stroke={DAILY_CROSS_CURRENT_MONTH_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="admin-line-legend">
            <span><i style={{ background: DAILY_CROSS_CURRENT_MONTH_COLOR }} /> {charts.dailyMonthCross.currentMonthLabel}</span>
            <span><i style={{ background: DAILY_CROSS_LAST_MONTH_COLOR }} /> {charts.dailyMonthCross.lastMonthLabel}</span>
          </div>
        </div>
      </section>
    </>
  );
}
