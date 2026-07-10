import { useEffect, useMemo, useState } from "react";
import {
  api,
  formatChangePercent,
  formatHkd,
  type Alert,
  type MerchantInsightRow,
  type MerchantListSortKey,
  type SalesInsightSummary,
  type SalesPeriodColumn,
} from "@/api/client";
import { MerchantStatusTag } from "@/components/MerchantStatusTag";
import {
  normalizeMerchantInsightRow,
  sortMerchantsForView,
} from "@/utils/merchantInsightView";
import { AlertListSection, countAlertReadState } from "@/components/AlertListSection";
import { type AlertStatusFilter } from "@/components/AlertReadFilterTabs";
import { useAuth } from "@/context/AuthContext";
import { useFollowUpLatest } from "@/components/FollowUpPanel";
import { AppShell } from "@/components/AppShell";
import { PageLoader } from "@/components/PageLoader";
import { NeoButton } from "@/components/NeoButton";
import { BRAND } from "@/config/branding";

interface TigerTeamSalesPageProps {
  salesUserId: number;
  onBack: () => void;
  onOpenMerchant: (merchantId: number) => void;
  apiPathPrefix?: string;
  scopeLabel?: string;
  backLabel?: string;
}

const MERCHANT_SORT_BUTTONS: { value: MerchantListSortKey; label: string }[] = [
  { value: "lastMonthAmount", label: "上月交易" },
  { value: "newSilent", label: "新沉默" },
  { value: "declining", label: "下跌中" },
  { value: "rising", label: "上漲" },
  { value: "unreadAlerts", label: "預警跟進" },
];

function ChangePill({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="muted">—</span>;
  const up = value >= 0;
  return (
    <span className={`change-pill ${up ? "up" : "down"}`} title={label}>
      {up ? "↑" : "↓"} {value > 0 ? "+" : ""}
      {formatChangePercent(value)}%
    </span>
  );
}

function MerchantInsightTable({
  rows,
  sortKey,
  onOpenMerchant,
}: {
  rows: MerchantInsightRow[];
  sortKey: MerchantListSortKey;
  onOpenMerchant: (id: number) => void;
}) {
  if (rows.length === 0) {
    return <p className="muted">暫無符合條件的商戶</p>;
  }

  return (
    <div className="table-wrap table-wrap--stack">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>商戶</th>
            <th className={sortKey === "lastMonthAmount" ? "sort-col-active" : undefined}>上月</th>
            <th>本月 MTD</th>
            <th
              className={
                sortKey === "declining" || sortKey === "rising" ? "sort-col-active" : undefined
              }
            >
              日均變化
            </th>
            <th>狀態</th>
            <th>最後交易</th>
            <th className="data-table-actions" aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {rows.map((m, index) => (
            <tr
              key={m.id}
              className={
                m.status === "newSilent" || m.status === "declining" || m.hasUnreadAlert
                  ? "tiger-row--alert"
                  : undefined
              }
            >
              <td data-label="排名">{index + 1}</td>
              <td data-label="商戶">
                <strong>{m.name}</strong>
              </td>
              <td
                className={`amount-cell ${sortKey === "lastMonthAmount" ? "sort-col-active" : ""}`}
                data-label="上月"
              >
                {formatHkd(m.lastMonthAmount)}
              </td>
              <td className="amount-cell" data-label="本月 MTD">
                {formatHkd(m.mtdAmount)}
              </td>
              <td
                className={
                  sortKey === "declining" || sortKey === "rising" ? "sort-col-active" : undefined
                }
                data-label="日均變化"
              >
                <ChangePill value={m.dailyAvgChangePercent} label="本月日均 vs 上月日均" />
              </td>
              <td data-label="狀態">
                <MerchantStatusTag status={m.status} unreadAlertPeriods={m.unreadAlertPeriods} />
              </td>
              <td data-label="最後交易">{m.lastTxnDate ?? "—"}</td>
              <td className="data-table-actions" data-label="操作">
                <NeoButton size="xs" onClick={() => onOpenMerchant(m.id)}>
                  查看 →
                </NeoButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TigerTeamSalesPage({
  salesUserId,
  onBack,
  onOpenMerchant,
  apiPathPrefix = "/tiger-team",
  scopeLabel = "飛虎隊",
  backLabel = "返回飛虎隊",
}: TigerTeamSalesPageProps) {
  const [salesName, setSalesName] = useState("");
  const [periods, setPeriods] = useState<SalesPeriodColumn[]>([]);
  const [insightSummary, setInsightSummary] = useState<SalesInsightSummary | null>(null);
  const [merchants, setMerchants] = useState<MerchantInsightRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sort, setSort] = useState<MerchantListSortKey>("lastMonthAmount");
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api<{
      sales: { displayName: string };
      periods: SalesPeriodColumn[];
      insightSummary: SalesInsightSummary;
      merchants: MerchantInsightRow[];
      alerts: Alert[];
    }>(`${apiPathPrefix}/${salesUserId}`)
      .then((data) => {
        setSalesName(data.sales.displayName);
        setPeriods(data.periods);
        setInsightSummary(data.insightSummary);
        setMerchants(data.merchants.map(normalizeMerchantInsightRow));
        setAlerts(data.alerts);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [salesUserId, apiPathPrefix]);

  const displayedMerchants = useMemo(
    () => sortMerchantsForView(merchants, sort),
    [merchants, sort]
  );

  const { unfollowed, total } = countAlertReadState(alerts);
  const sortHint = MERCHANT_SORT_BUTTONS.find((b) => b.value === sort)?.label ?? "上月交易";

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

  const sortDesc: Record<MerchantListSortKey, string> = {
    lastMonthAmount: "按上月交易額從高到低排列全部商戶。",
    newSilent: "上月有交易、本月截至昨日無交易的商戶，按上月額排序。",
    declining: "本月日均較上月日均下跌超過閾值的商戶，按跌幅從大到小。",
    rising: "本月日均較上月上漲的商戶，按漲幅從大到小。",
    unreadAlerts: "有未跟進預警的商戶；下方可查看預警明細與跟進記錄。",
  };

  return (
    <AppShell
      title={salesName || "銷售詳情"}
      subtitle={`${scopeLabel} · ${BRAND.companyName}`}
      onBack={onBack}
      backLabel={backLabel}
    >
      {loading ? (
        <PageLoader block />
      ) : (
        <>
          <section className="panel">
            <h2 className="panel-title">三個月交易概覽</h2>
            <div className="tiger-period-grid">
              {periods.map((p) => (
                <div key={p.key} className="tiger-period-card">
                  <div className="tiger-period-head">
                    <h3>{p.rangeLabel}</h3>
                  </div>
                  <p className="tiger-period-amount">{formatHkd(p.totalAmount)}</p>
                  <p className="tiger-period-active">
                    有交易商戶 <strong>{p.activeMerchantCount}</strong> / {p.assignedMerchantCount} 家
                  </p>
                  {p.key !== "twoMonthsAgo" && (
                    <div className="tiger-period-changes">
                      <div>
                        <span className="tiger-change-label">交易額環比</span>
                        <ChangePill value={p.amountChangePercent} label="交易額環比" />
                      </div>
                      <div>
                        <span className="tiger-change-label">日均環比</span>
                        <ChangePill value={p.dailyAvgChangePercent} label="日均環比" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {insightSummary && (
              <div className="insight-summary-chips">
                <span className="insight-chip">
                  活躍 <strong>{insightSummary.activeMerchantCount}</strong> /{" "}
                  {insightSummary.assignedMerchantCount}
                </span>
                <span className="insight-chip insight-chip--rose">
                  新沉默 <strong>{insightSummary.newSilentCount}</strong>
                </span>
                <span className="insight-chip insight-chip--amber">
                  下跌中 <strong>{insightSummary.decliningCount}</strong>
                </span>
                <span className="insight-chip insight-chip--green">
                  上漲 <strong>{insightSummary.risingCount}</strong>
                </span>
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">名下商戶</h2>
            <p className="panel-desc panel-desc-tight">
              默認按<strong>上月交易額</strong>排名。切換按鈕按新沉默、下跌中、上漲或預警跟進查看。
            </p>
            <div className="detail-tabs sales-rank-tabs">
              {MERCHANT_SORT_BUTTONS.map((btn) => {
                const count =
                  btn.value === "newSilent"
                    ? insightSummary?.newSilentCount
                    : btn.value === "declining"
                      ? insightSummary?.decliningCount
                      : btn.value === "rising"
                        ? insightSummary?.risingCount
                        : btn.value === "unreadAlerts"
                          ? unfollowed
                          : undefined;
                return (
                  <button
                    key={btn.value}
                    type="button"
                    className={`detail-tab ${sort === btn.value ? "active" : ""}`}
                    onClick={() => setSort(btn.value)}
                  >
                    {btn.label}
                    {count !== undefined && count > 0 ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>
            <p className="panel-desc panel-desc-tight muted" style={{ marginTop: 0 }}>
              當前：<strong>{sortHint}</strong> — {sortDesc[sort]}
            </p>

            {sort === "unreadAlerts" ? (
              <>
                <MerchantInsightTable
                  rows={displayedMerchants}
                  sortKey={sort}
                  onOpenMerchant={onOpenMerchant}
                />
                <div className="panel-head" style={{ marginTop: 24 }}>
                  <h3 className="panel-title" style={{ fontSize: "1rem" }}>
                    預警明細與跟進
                  </h3>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {unfollowed} 條未跟進 / 共 {total} 條
                  </span>
                </div>
                <AlertListSection
                  alerts={alerts}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  currentUserId={user?.id}
                  showAdminRepliedTab
                  showLeaderReadTab={apiPathPrefix === "/leader/team"}
                  showSalesTag={false}
                  merchantActionLabel="查看商戶"
                  onOpenMerchant={onOpenMerchant}
                  followUpLatest={followUpLatest}
                  onFollowUpUpdated={refreshFollowUps}
                  onAcknowledged={load}
                  onLeaderRead={load}
                  emptyDefaultMessage="暫無週、月預警"
                />
              </>
            ) : (
              <MerchantInsightTable
                rows={displayedMerchants}
                sortKey={sort}
                onOpenMerchant={onOpenMerchant}
              />
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
