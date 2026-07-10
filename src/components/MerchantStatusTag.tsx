import type { MerchantInsightStatus } from "@/api/client";

const STATUS_LABEL: Record<MerchantInsightStatus, string> = {
  newSilent: "新沉默",
  declining: "下跌中",
  rising: "上漲",
  flat: "持平",
  inactive: "無交易",
};

const ALERT_PERIOD_LABEL = { week: "週預警", month: "月預警" } as const;

const ALERT_TOOLTIP =
  "依週/月環比跌幅超過預警閾值觸發；「上漲/下跌中」則看本月日均 vs 上月日均，兩者口徑不同。";

const ALERT_TOOLTIP_RISING =
  "日均趨勢已好轉（上漲），但週/月環比仍達預警線，建議繼續跟進直至預警處理完成。";

export function MerchantStatusTag({
  status,
  unreadAlertPeriods,
}: {
  status: MerchantInsightStatus;
  unreadAlertPeriods?: Array<"week" | "month">;
}) {
  const periods = unreadAlertPeriods ?? [];
  const tone =
    status === "newSilent"
      ? "rose"
      : status === "declining"
        ? "amber"
        : status === "rising"
          ? "green"
          : "muted";
  const alertMuted = status === "rising";

  return (
    <span className="merchant-status-tags">
      <span className={`status-tag status-tag--${tone}`}>{STATUS_LABEL[status]}</span>
      {periods.map((period) => (
        <span
          key={period}
          className={`status-tag ${alertMuted ? "status-tag--alert-muted" : "status-tag--alert"}`}
          title={alertMuted ? ALERT_TOOLTIP_RISING : ALERT_TOOLTIP}
        >
          {ALERT_PERIOD_LABEL[period]}
        </span>
      ))}
    </span>
  );
}
