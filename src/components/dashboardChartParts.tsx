import { useState } from "react";
import type { TooltipProps } from "recharts";
import {
  Pie,
  PieChart,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatChangePercent, formatHkd, type AdminMerchantInsightBucket } from "@/api/client";

export const CHART_TOOLTIP_STYLE = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
  fontSize: 13,
  whiteSpace: "normal" as const,
  maxWidth: "min(calc(100vw - 32px), 280px)",
};

/** 工作台多图同屏，关闭动画减轻卡顿 */
export const CHART_STATIC_PROPS = { isAnimationActive: false } as const;

/** 日交易双线：上月朱红、本月墨绿 */
export const DAILY_CROSS_LAST_MONTH_COLOR = "#c83c23";
export const DAILY_CROSS_CURRENT_MONTH_COLOR = "#1e5631";

export interface DailyCrossChartRow {
  label: string;
  current: number | null;
  last: number;
  currentTxnCount?: number | null;
  lastTxnCount: number;
}

export function DailyCrossChartTooltip({
  active,
  payload,
  label,
  currentMonthLabel,
  lastMonthLabel,
}: TooltipProps<number, string> & {
  currentMonthLabel: string;
  lastMonthLabel: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0].payload as DailyCrossChartRow;
  const diff =
    row.current == null ? null : row.current - row.last;
  const diffLabel =
    diff == null
      ? null
      : diff === 0
        ? "持平"
        : `${diff > 0 ? "+" : ""}${formatHkd(diff)}`;

  return (
    <div className="daily-cross-tooltip" style={CHART_TOOLTIP_STYLE}>
      <p className="daily-cross-tooltip__day">{label ?? row.label}</p>
      <div className="daily-cross-tooltip__row">
        <span
          className="daily-cross-tooltip__dot"
          style={{ background: DAILY_CROSS_LAST_MONTH_COLOR }}
          aria-hidden
        />
        <div className="daily-cross-tooltip__body">
          <strong>{lastMonthLabel}</strong>
          <span>{formatHkd(row.last)}</span>
          <span className="daily-cross-tooltip__meta">{row.lastTxnCount.toLocaleString()} 筆</span>
        </div>
      </div>
      <div className="daily-cross-tooltip__row">
        <span
          className="daily-cross-tooltip__dot"
          style={{ background: DAILY_CROSS_CURRENT_MONTH_COLOR }}
          aria-hidden
        />
        <div className="daily-cross-tooltip__body">
          <strong>{currentMonthLabel}</strong>
          {row.current == null ? (
            <span>—</span>
          ) : (
            <>
              <span>{formatHkd(row.current)}</span>
              <span className="daily-cross-tooltip__meta">
                {row.currentTxnCount?.toLocaleString() ?? 0} 筆
                {diffLabel ? ` · 差額 ${diffLabel}` : null}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const DAILY_CROSS_CHART_MARGIN = { top: 12, right: 12, left: 4, bottom: 4 } as const;

export const DAILY_CROSS_TOOLTIP_PROPS = {
  offset: 8,
  reverseDirection: { x: true, y: false },
  wrapperStyle: { zIndex: 20, outline: "none" },
} as const;

const INSIGHT_COLORS: Record<string, string> = {
  rising: "#16a34a",
  declining: "#d97706",
  newSilent: "#e11d48",
  flat: "#64748b",
};

export const INSIGHT_BUCKET_ORDER: Array<{ key: AdminMerchantInsightBucket["key"]; label: string }> = [
  { key: "rising", label: "上漲" },
  { key: "declining", label: "下跌中" },
  { key: "newSilent", label: "新沉默" },
  { key: "flat", label: "平穩" },
];

export function ChangePill({ value, title }: { value: number | null; title: string }) {
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

export interface RankRow {
  rank: number;
  id: number;
  title: string;
  subtitle?: string | null;
  amount: number;
  sharePercent: number;
  meta?: string;
}

export function HorizontalRankBoard({
  title,
  rows,
  maxShare,
  onRowClick,
  footerAction,
  emptyHint,
  previewLimit,
}: {
  title: string;
  rows: RankRow[];
  maxShare: number;
  onRowClick?: (id: number) => void;
  footerAction?: { label: string; onClick: () => void };
  emptyHint?: string;
  /** 默认折叠，仅展示前 N 名；点击后展开全部 */
  previewLimit?: number;
}) {
  const scale = maxShare > 0 ? maxShare : 1;
  const canCollapse = previewLimit != null && rows.length > previewLimit;
  const [expanded, setExpanded] = useState(false);
  const visibleRows = canCollapse && !expanded ? rows.slice(0, previewLimit) : rows;

  return (
    <section className="panel admin-rank-panel">
      <div className="panel-intro">
        <h2 className="panel-title">{title}</h2>
        {canCollapse && !expanded ? (
          <p className="panel-desc panel-desc-tight">預覽前 {previewLimit} 名 · 共 {rows.length} 家</p>
        ) : null}
      </div>
      {rows.length === 0 && emptyHint ? (
        <p className="panel-desc panel-desc-tight admin-rank-empty">{emptyHint}</p>
      ) : (
        <div className={`rank-board-wrap ${canCollapse && !expanded ? "rank-board-wrap--preview" : ""}`}>
          <ol className="rank-board-list">
          {visibleRows.map((row) => {
            const widthPct = Math.max(4, Math.round((row.sharePercent / scale) * 100));
            const tone = row.rank <= 3 ? `rank-board-row--top${row.rank}` : "rank-board-row--rest";
            return (
              <li key={`${row.id}-${row.rank}`}>
                <button
                  type="button"
                  className={`rank-board-row ${tone}`}
                  onClick={() => onRowClick?.(row.id)}
                  disabled={!onRowClick}
                >
                  <span className="rank-board-rank">{row.rank}</span>
                  <div className="rank-board-body">
                    <div className="rank-board-bar-track">
                      <div className="rank-board-bar" style={{ width: `${widthPct}%` }} />
                      <span className="rank-board-name">{row.title}</span>
                    </div>
                    {row.subtitle ? <span className="rank-board-sub">{row.subtitle}</span> : null}
                    {row.meta ? <span className="rank-board-meta-line">{row.meta}</span> : null}
                  </div>
                  <div className="rank-board-value">
                    <strong>{formatHkd(row.amount)}</strong>
                    <span>{row.sharePercent.toFixed(1)}%</span>
                  </div>
                </button>
              </li>
            );
          })}
          </ol>
        </div>
      )}
      {canCollapse ? (
        <div className="admin-rank-expand">
          <button
            type="button"
            className="btn btn-sm btn-ghost rank-board-expand-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "收起" : `展開全部 ${rows.length} 名`}
            <svg
              className={`rank-board-expand-icon ${expanded ? "rank-board-expand-icon--open" : ""}`}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      ) : null}
      {footerAction ? (
        <div className="admin-rank-footer">
          <button type="button" className="btn btn-sm btn-ghost" onClick={footerAction.onClick}>
            {footerAction.label}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function InsightMiniDonut({
  title,
  bucket,
}: {
  title: string;
  bucket: AdminMerchantInsightBucket | undefined;
}) {
  const percent = bucket?.percent ?? 0;
  const ringData = [
    { key: "share", value: percent },
    { key: "rest", value: Math.max(0, 100 - percent) },
  ];

  return (
    <div className="admin-insight-mini-donut">
      <h3 className="admin-insight-mini-donut-title">{title}</h3>
      <div className="admin-insight-mini-donut__ring">
        <ResponsiveContainer width="100%" height={108}>
          <PieChart>
            <Pie
              data={ringData}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={44}
              startAngle={90}
              endAngle={-270}
              paddingAngle={0}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={bucket ? INSIGHT_COLORS[bucket.key] : "#cbd5e1"} />
              <Cell fill="#e8edf3" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="admin-insight-mini-donut-center" aria-hidden="true">
          <strong>{percent.toFixed(1)}%</strong>
        </div>
      </div>
      {bucket ? <p className="admin-insight-mini-donut-meta">{bucket.count} 家</p> : null}
    </div>
  );
}
