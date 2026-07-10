import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  formatChangePercent,
  formatHkd,
  type MerchantLimitProfile,
  type PeriodBucket,
  type Transaction,
} from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { PageLoader } from "@/components/PageLoader";

const PERIOD_LABEL = { day: "日", week: "週", month: "月" } as const;
const PERIOD_RANGE = { day: "近31日", week: "近8週", month: "近3個月" } as const;

function formatAxisAmount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 10_000)}萬`;
  return String(value);
}

function trendChartHeight(period: "day" | "week" | "month", count: number): number {
  if (period === "day") return 200;
  const row = period === "month" ? 46 : 34;
  return Math.max(150, count * row + 28);
}

type TrendChartRow = { label: string; 金額: number; 筆數: number };

function MerchantTrendChart({
  period,
  data,
}: {
  period: "day" | "week" | "month";
  data: TrendChartRow[];
}) {
  const height = trendChartHeight(period, data.length);

  if (period === "day") {
    return (
      <div className="chart-panel__chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#94a3b8", fontSize: 8 }}
              axisLine={false}
              tickLine={false}
              interval={2}
              angle={-40}
              textAnchor="end"
              height={40}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 8 }} axisLine={false} tickLine={false} width={52} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value: number) => [formatHkd(value), "金額"]}
            />
            <Bar dataKey="金額" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="chart-panel__chart chart-panel__chart--horizontal" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 8, right: 20, left: 4, bottom: 8 }}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#94a3b8", fontSize: 8 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatAxisAmount}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={40}
            tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            reversed
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value: number, _name, item) => [
              `${formatHkd(value)} · ${item.payload.筆數} 筆`,
              "金額",
            ]}
          />
          <Bar
            dataKey="金額"
            fill="#2563eb"
            radius={[0, 6, 6, 0]}
            maxBarSize={period === "month" ? 32 : 22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
const PERIOD_COMPARE = {
  day: "前30日均值 vs 昨日",
  week: "上週 vs 上上週",
  month: "上月 vs 上上月",
} as const;

const USAGE_WARN_PERCENT = 75;

interface MerchantPageProps {
  merchantId: number;
  onBack: () => void;
}

const chartTooltipStyle = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
  fontSize: 12,
};

function LimitValue({ value }: { value: number | null }) {
  if (value == null || value <= 0) return <span className="muted">—</span>;
  return <>{formatHkd(value)}</>;
}

function UsageMeter({
  title,
  percent,
  used,
  limit,
  mtdLabel,
}: {
  title: string;
  percent: number | null;
  used: number;
  limit: number | null;
  mtdLabel: string;
}) {
  if (limit == null || limit <= 0) {
    return (
      <p className="limit-channel-empty muted">
        {title}：未配置單月額度{mtdLabel ? `（${mtdLabel}已用 ${formatHkd(used)}）` : ""}
      </p>
    );
  }

  const pct = percent ?? 0;
  const level = pct >= 90 ? "danger" : pct >= USAGE_WARN_PERCENT ? "warn" : "ok";

  return (
    <div className={`limit-usage-meter limit-usage-meter--${level}`}>
      <div className="limit-usage-meter-head">
        <span>{title} · {mtdLabel}</span>
        <strong>{formatChangePercent(pct)}%</strong>
      </div>
      <div className="limit-usage-meter-track" aria-hidden>
        <div className="limit-usage-meter-fill" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="limit-usage-meter-foot">
        已用 {formatHkd(used)} / 額度 {formatHkd(limit)}
      </p>
      {pct >= USAGE_WARN_PERCENT && (
        <p className="limit-usage-alert">
          {pct >= 90 ? "額度即將用盡，請盡快申請提額" : "已達 75%，建議提前聯繫公司申請提額"}
        </p>
      )}
    </div>
  );
}

function MerchantLimitPanel({ profile }: { profile: MerchantLimitProfile }) {
  const showCard = Boolean(
    profile.card.monthlyLimit || profile.card.singleLimit || profile.card.dailyLimit
  );
  const showScan = Boolean(
    profile.scan.monthlyLimit || profile.scan.singleLimit || profile.scan.dailyLimit
  );

  if (!profile.hasLimits && !profile.merchantCode) {
    return (
      <section className="panel limits-panel">
        <h2 className="panel-title">額度配置與使用</h2>
        <p className="panel-desc muted">尚未匹配商戶編號或未導入額度表，請聯繫管理員在後臺導入。</p>
      </section>
    );
  }

  if (!showCard && !showScan) {
    return (
      <section className="panel limits-panel">
        <h2 className="panel-title">額度配置與使用</h2>
        <p className="panel-desc muted">
          商戶編號 {profile.merchantCode ?? "—"} · 暫無額度配置，請在後臺導入刷卡/掃碼額度表。
        </p>
      </section>
    );
  }

  const renderChannel = (
    title: string,
    channel: MerchantLimitProfile["card"],
    meterTitle: string
  ) => (
    <div className="limit-channel-block">
      <h3 className="limit-channel-title">{title}</h3>
      <dl className="limit-tier-grid">
        <div>
          <dt>單筆限額</dt>
          <dd>
            <LimitValue value={channel.singleLimit} />
          </dd>
        </div>
        <div>
          <dt>單日限額</dt>
          <dd>
            <LimitValue value={channel.dailyLimit} />
          </dd>
        </div>
        <div>
          <dt>單月限額</dt>
          <dd>
            <LimitValue value={channel.monthlyLimit} />
          </dd>
        </div>
      </dl>
      <UsageMeter
        title={meterTitle}
        percent={channel.monthlyPercent}
        used={channel.mtdUsed}
        limit={channel.monthlyLimit}
        mtdLabel={profile.mtdLabel}
      />
    </div>
  );

  return (
    <section className="panel limits-panel">
      <h2 className="panel-title">額度配置與使用</h2>
      <p className="panel-desc panel-desc-tight">
        單筆 / 單日 / 單月限額及本月使用進度，便於向商戶說明並提前申請提額。
      </p>
      {profile.merchantCode && (
        <p className="limit-merchant-code muted">商戶編號 {profile.merchantCode}</p>
      )}
      {showCard && renderChannel("刷卡額度", profile.card, "刷卡")}
      {showScan && renderChannel("掃碼額度", profile.scan, "掃碼")}
    </section>
  );
}

export function MerchantPage({ merchantId, onBack }: MerchantPageProps) {
  const [name, setName] = useState("");
  const [salesName, setSalesName] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [limitProfile, setLimitProfile] = useState<MerchantLimitProfile | null>(null);
  const [periods, setPeriods] = useState<
    Array<{
      period: "day" | "week" | "month";
      series: PeriodBucket[];
      change: {
        current: PeriodBucket | null;
        previous: PeriodBucket | null;
        changePercent: number | null;
      };
    }>
  >([]);
  const [chartPeriod, setChartPeriod] = useState<"day" | "week" | "month">("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{
      merchant: { name: string; salesName: string };
      transactions: Transaction[];
      periods: typeof periods;
      limitProfile: MerchantLimitProfile;
    }>(`/merchants/${merchantId}`)
      .then((d) => {
        setName(d.merchant.name);
        setSalesName(d.merchant.salesName);
        setTransactions(d.transactions);
        setLimitProfile(d.limitProfile);
        setPeriods(
          d.periods.map((p) => ({
            ...p,
            change: {
              current: p.change.current,
              previous: p.change.previous,
              changePercent: p.change.changePercent,
            },
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [merchantId]);

  const currentPeriod = periods.find((p) => p.period === chartPeriod);
  const chartData =
    currentPeriod?.series.map((b) => ({
      label: b.label,
      金額: Math.round(b.amount),
      筆數: b.count,
    })) ?? [];

  if (loading) return <PageLoader fullPage />;

  return (
    <AppShell
      title={name}
      subtitle={`商戶交易詳情 · 歸屬銷售：${salesName}`}
      onBack={onBack}
      backLabel="返回列表"
    >
      <div className="merchant-meta">
        <span className="alert-sales-tag">銷售 {salesName}</span>
      </div>
      <section className="change-cards">
        {periods.map((p) => (
          <div
            key={p.period}
            className={`change-card ${chartPeriod === p.period ? "active" : ""}`}
            onClick={() => setChartPeriod(p.period)}
            onKeyDown={(e) => e.key === "Enter" && setChartPeriod(p.period)}
            role="button"
            tabIndex={0}
          >
            <span className="change-title">{PERIOD_LABEL[p.period]}環比</span>
            <span className="change-range">{PERIOD_COMPARE[p.period]}</span>
            {p.change.changePercent !== null ? (
              <>
                <span className={`change-pct ${p.change.changePercent < 0 ? "down" : "up"}`}>
                  {p.change.changePercent > 0 ? "+" : ""}
                  {formatChangePercent(p.change.changePercent)}%
                </span>
                <span className="change-detail">
                  {p.change.previous?.label} → {p.change.current?.label}
                </span>
                <span className="change-amt">
                  {formatHkd(Math.round(p.change.previous?.amount ?? 0))} →{" "}
                  {formatHkd(Math.round(p.change.current?.amount ?? 0))}
                  {p.period === "day" && (
                    <span className="change-amt-note">（基準為前30日日均）</span>
                  )}
                </span>
              </>
            ) : (
              <span className="muted">數據不足</span>
            )}
          </div>
        ))}
      </section>

      <div className="merchant-insights-row">
        <section className="panel chart-panel chart-panel--compact">
          <h2 className="panel-title">{PERIOD_LABEL[chartPeriod]}度交易趨勢</h2>
          <p className="panel-desc panel-desc-tight">
            {PERIOD_RANGE[chartPeriod]}，共 {chartData.length} 個週期
          </p>
          <MerchantTrendChart period={chartPeriod} data={chartData} />
        </section>

        {limitProfile && <MerchantLimitPanel profile={limitProfile} />}
      </div>

      <section className="panel">
        <h2 className="panel-title">交易明細</h2>
        <div className="table-wrap table-wrap--stack">
          <table className="data-table">
            <thead>
              <tr>
                <th>交易名稱</th>
                <th>時間</th>
                <th>金額</th>
                <th>明細</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td data-label="交易名稱">{t.txn_name}</td>
                  <td data-label="時間" style={{ color: "var(--text-secondary)" }}>
                    {new Date(t.txn_time).toLocaleString("zh-HK")}
                  </td>
                  <td className="amount-cell" data-label="金額">
                    {formatHkd(t.amount)}
                  </td>
                  <td data-label="明細" style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                    {t.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
