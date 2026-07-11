import {
  formatChangePercent,
  formatHkd,
  type MerchantListSortKey,
  type SalesHomeInsightSnapshot,
} from "@/api/client";

interface InsightJump {
  sort: MerchantListSortKey;
  label: string;
  count: number;
  tone: "rose" | "amber" | "green" | "blue";
}

interface SalesHomeInsightPanelProps {
  snapshot: SalesHomeInsightSnapshot;
  unreadAlerts: number;
  scopeLabel: string;
  onOpenMerchants: (sort?: MerchantListSortKey) => void;
  onOpenAlerts: () => void;
  /** 工作台 Hero 已展示 MTD 時，僅保留快捷跳轉 */
  compact?: boolean;
  merchantsLabel?: string;
}

function DailyAvgChange({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="muted">日均環比 —</span>;
  }
  const up = value >= 0;
  return (
    <span className={`change-pill ${up ? "up" : "down"}`} title="本月日均 vs 上月日均">
      {up ? "↑ 上漲" : "↓ 下跌"} {value > 0 ? "+" : ""}
      {formatChangePercent(value)}%
    </span>
  );
}

export function SalesHomeInsightPanel({
  snapshot,
  unreadAlerts,
  scopeLabel,
  onOpenMerchants,
  onOpenAlerts,
  compact = false,
  merchantsLabel = "我的商戶",
}: SalesHomeInsightPanelProps) {
  const { insightSummary } = snapshot;

  const jumps: InsightJump[] = [
    {
      sort: "newSilent",
      label: "新沉默",
      count: insightSummary.newSilentCount,
      tone: "rose",
    },
    {
      sort: "declining",
      label: "下跌中",
      count: insightSummary.decliningCount,
      tone: "amber",
    },
    {
      sort: "rising",
      label: "上漲",
      count: insightSummary.risingCount,
      tone: "green",
    },
    {
      sort: "unreadAlerts",
      label: "預警跟進",
      count: snapshot.unreadAlertMerchantCount,
      tone: "blue",
    },
  ];

  return (
    <section className="panel sales-home-insight">
      <div className="sales-home-insight-head">
        <div>
          <p className="sales-home-insight-kicker">{scopeLabel}</p>
          <h2 className="panel-title sales-home-insight-title">
            {compact ? "商戶快捷篩選" : "本月交易摘要"}
          </h2>
          {!compact ? <p className="panel-desc panel-desc-tight">{snapshot.mtdLabel}</p> : null}
        </div>
        <button type="button" className="btn btn-sm btn-brutalist" onClick={() => onOpenMerchants()}>
          {merchantsLabel} →
        </button>
      </div>

      {!compact ? (
        <>
          <div className="sales-home-insight-hero">
            <p className="sales-home-insight-amount">{formatHkd(snapshot.mtdAmount)}</p>
            <DailyAvgChange value={snapshot.dailyAvgChangePercent} />
          </div>

          <p className="sales-home-insight-meta">
            活躍 <strong>{insightSummary.activeMerchantCount}</strong> 家 · 歸屬{" "}
            <strong>{insightSummary.assignedMerchantCount}</strong> 家
            {unreadAlerts > 0 ? (
              <>
                {" "}
                ·{" "}
                <button type="button" className="sales-home-insight-link" onClick={onOpenAlerts}>
                  {unreadAlerts} 條未跟進預警
                </button>
              </>
            ) : null}
          </p>
        </>
      ) : null}

      <p className="panel-desc panel-desc-tight">
        {compact ? "點擊標籤跳轉商戶列表對應篩選：" : "點擊下方標籤，跳轉至「我的商戶」對應篩選："}
      </p>
      <div className="sales-home-insight-jumps">
        {jumps.map((item) => (
          <button
            key={item.sort}
            type="button"
            className={`sales-home-insight-jump sales-home-insight-jump--${item.tone}`}
            onClick={() => onOpenMerchants(item.sort)}
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
