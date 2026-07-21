import { useEffect, useMemo, useState } from "react";
import { api, formatChangePercent, formatHkd, type MerchantListSortKey, type MerchantSummary, type TigerTeamSalesRow } from "@/api/client";
import { dailyAvgBaselineHint } from "@/utils/dailyAvgChange";
import { MerchantStatusTag } from "@/components/MerchantStatusTag";
import { normalizeMerchantSummary, sortMerchantsForView } from "@/utils/merchantInsightView";
import { PageLoader } from "@/components/PageLoader";
import { AppShell } from "@/components/AppShell";
import { MerchantSearchInput } from "@/components/MerchantSearchInput";
import { NeoButton } from "@/components/NeoButton";
import { SalesFilterSelect } from "@/components/SalesFilterSelect";
import { useAuth } from "@/context/AuthContext";
import { merchantsNavLabel } from "@/config/navigation";
import type { SalesFilter } from "@/utils/salesFilter";

interface MerchantsPageProps {
  onOpenMerchant: (id: number) => void;
  initialViewSort?: MerchantListSortKey;
  initialSalesFilter?: SalesFilter;
}

type SortKey =
  | "lastMonthAmount"
  | "mtdAmount"
  | "dailyAvgChangePercent"
  | "cardLimitPercent"
  | "scanLimitPercent";

type SortDir = "asc" | "desc";

const INSIGHT_SORT_BUTTONS: { value: MerchantListSortKey; label: string }[] = [
  { value: "lastMonthAmount", label: "上月交易" },
  { value: "newSilent", label: "新沉默" },
  { value: "declining", label: "下跌中" },
  { value: "rising", label: "上漲" },
  { value: "unreadAlerts", label: "預警跟進" },
];

const LIMIT_SORT_KEYS = new Set<SortKey>(["cardLimitPercent", "scanLimitPercent"]);

const VIEW_SORT_DESC: Record<MerchantListSortKey, string> = {
  lastMonthAmount: "按上月交易額從高到低排列全部商戶。",
  newSilent: "上月有交易、本月截至昨日無交易的商戶，按上月額排序。",
  declining: "本月日均較上月日均下跌超過閾值的商戶，按跌幅從大到小。",
  rising: "本月日均較上月上漲的商戶，按漲幅從大到小。",
  unreadAlerts: "僅顯示有未跟進預警的商戶；詳細跟進請至「交易預警」。",
};

function matchMerchant(query: string, merchant: MerchantSummary): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (String(merchant.id).includes(q)) return true;
  if (merchant.name.toLowerCase().includes(q)) return true;
  if (merchant.merchantCode?.toLowerCase().includes(q)) return true;
  return false;
}

function matchSalesFilter(merchant: MerchantSummary, filter: SalesFilter, leaderUserId?: number): boolean {
  if (filter === "all") return true;
  if (filter === "self") return merchant.salesUserId === leaderUserId;
  if (filter === "unassigned") return merchant.salesUserId == null;
  return merchant.salesUserId === filter;
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: SortDir
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "desc" ? b - a : a - b;
}

function sortMerchants(rows: MerchantSummary[], key: SortKey, dir: SortDir): MerchantSummary[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (key) {
      case "lastMonthAmount":
        return dir === "desc" ? b.lastMonthAmount - a.lastMonthAmount : a.lastMonthAmount - b.lastMonthAmount;
      case "mtdAmount":
        return dir === "desc" ? b.mtdAmount - a.mtdAmount : a.mtdAmount - b.mtdAmount;
      case "dailyAvgChangePercent":
        return compareNullableNumber(a.dailyAvgChangePercent, b.dailyAvgChangePercent, dir);
      case "cardLimitPercent":
        return compareNullableNumber(a.cardLimitPercent, b.cardLimitPercent, dir);
      case "scanLimitPercent":
        return compareNullableNumber(a.scanLimitPercent, b.scanLimitPercent, dir);
      default:
        return 0;
    }
  });
  return sorted;
}

function DailyAvgChange({ value, lastMonthAmount }: { value: number | null; lastMonthAmount?: number }) {
  if (value === null) {
    return <span className="muted">—</span>;
  }
  const up = value >= 0;
  const baselineHint =
    lastMonthAmount !== undefined ? dailyAvgBaselineHint(lastMonthAmount) : undefined;
  return (
    <span
      className={`change-pill ${up ? "up" : "down"}`}
      title={baselineHint ?? "本月日均 vs 上月日均"}
    >
      {up ? "↑ 上漲" : "↓ 下跌"} {value > 0 ? "+" : ""}
      {formatChangePercent(value)}%
    </span>
  );
}

const LIMIT_WARN_PERCENT = 75;
const LIMIT_DANGER_PERCENT = 90;

function limitPercentLevel(percent: number | null): "none" | "ok" | "warn" | "danger" {
  if (percent === null) return "none";
  if (percent >= LIMIT_DANGER_PERCENT) return "danger";
  if (percent >= LIMIT_WARN_PERCENT) return "warn";
  return "ok";
}

function merchantLimitRowLevel(m: MerchantSummary): "none" | "warn" | "danger" {
  const card = limitPercentLevel(m.cardLimitPercent);
  const scan = limitPercentLevel(m.scanLimitPercent);
  if (card === "danger" || scan === "danger") return "danger";
  if (card === "warn" || scan === "warn") return "warn";
  return "none";
}

function LimitPercent({
  percent,
  used,
  limit,
  label,
}: {
  percent: number | null;
  used: number;
  limit: number | null;
  label: string;
}) {
  if (percent === null) {
    return <span className="muted" title={limit == null ? "尚未導入額度" : "額度為 0"}>—</span>;
  }
  const level = limitPercentLevel(percent);
  const hint =
    level === "danger"
      ? " · 建議盡快申請提額"
      : level === "warn"
        ? " · 建議提前申請提額"
        : "";
  return (
    <span
      className={`limit-pct limit-pct--${level}`}
      title={`${label}：${formatHkd(used)} / ${formatHkd(limit ?? 0)}${hint}`}
    >
      {formatChangePercent(percent)}%
    </span>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  title,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  title?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th>
      <button
        type="button"
        className={`th-sort-btn${active ? " th-sort-btn--active" : ""}`}
        onClick={() => onSort(sortKey)}
        title={title ?? (active ? (dir === "desc" ? "由高到低，點擊改為由低到高" : "由低到高，點擊改為由高到低") : "點擊排序")}
        aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
      >
        <span>{label}</span>
        <span className="th-sort-icon" aria-hidden>
          {active ? (dir === "desc" ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function MerchantsPage({
  onOpenMerchant,
  initialViewSort,
  initialSalesFilter,
}: MerchantsPageProps) {
  const { user } = useAuth();
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [leaderTeam, setLeaderTeam] = useState<TigerTeamSalesRow[]>([]);
  const [rankMonth, setRankMonth] = useState("");
  const [mtdLabel, setMtdLabel] = useState("");
  const [currentMonth, setCurrentMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [salesFilter, setSalesFilter] = useState<SalesFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastMonthAmount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewSort, setViewSort] = useState<MerchantListSortKey>("lastMonthAmount");

  const isAdmin = user?.role === "admin";
  const isLeader = user?.role === "leader";
  const isSales = user?.role === "sales";
  const useInsightToolbar = isSales || isLeader;
  const showSalesFilter = isAdmin || isLeader;

  useEffect(() => {
    setViewSort(initialViewSort ?? "lastMonthAmount");
  }, [initialViewSort]);

  useEffect(() => {
    setSalesFilter(initialSalesFilter ?? "all");
  }, [initialSalesFilter]);

  useEffect(() => {
    setLoading(true);
    api<{ merchants: MerchantSummary[]; rankMonth: string; mtdLabel: string; currentMonth: string }>(
      "/merchants"
    )
      .then((data) => {
        setMerchants(data.merchants.map(normalizeMerchantSummary));
        setRankMonth(data.rankMonth);
        setMtdLabel(data.mtdLabel);
        setCurrentMonth(data.currentMonth);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isLeader) return;
    api<{ sales: TigerTeamSalesRow[] }>("/leader/team")
      .then((data) => setLeaderTeam(data.sales))
      .catch(() => setLeaderTeam([]));
  }, [isLeader]);

  useEffect(() => {
    if (!useInsightToolbar) return;
    document.querySelector(".merchants-insight-table")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [viewSort, useInsightToolbar]);

  const adminSalesOptions = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<number | "unassigned", string>();
    for (const m of merchants) {
      if (m.salesUserId == null) {
        map.set("unassigned", "待分配");
      } else {
        map.set(m.salesUserId, m.salesName?.trim() || `用戶 #${m.salesUserId}`);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  }, [isAdmin, merchants]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(
    () =>
      merchants.filter(
        (m) => matchMerchant(search, m) && matchSalesFilter(m, salesFilter, user?.id)
      ),
    [merchants, search, salesFilter, user?.id]
  );

  const insightCounts = useMemo(() => {
    if (!useInsightToolbar) return null;
    return {
      newSilent: filtered.filter((m) => m.status === "newSilent").length,
      declining: filtered.filter((m) => m.status === "declining").length,
      rising: filtered.filter((m) => m.status === "rising").length,
      unreadAlerts: filtered.filter((m) => m.hasUnreadAlert).length,
    };
  }, [filtered, useInsightToolbar]);

  const displayed = useMemo(() => {
    if (useInsightToolbar) {
      let list = sortMerchantsForView(filtered, viewSort);
      if (LIMIT_SORT_KEYS.has(sortKey)) {
        list = sortMerchants(list, sortKey, sortDir);
      }
      return list;
    }
    return sortMerchants(filtered, sortKey, sortDir);
  }, [filtered, useInsightToolbar, viewSort, sortKey, sortDir]);

  const viewSortHint = INSIGHT_SORT_BUTTONS.find((b) => b.value === viewSort)?.label ?? "上月交易";
  const hasInsightView = useInsightToolbar && viewSort !== "lastMonthAmount";

  const emptyMessage = useMemo(() => {
    if (search.trim() || salesFilter !== "all") {
      return "未找到符合篩選條件的商戶";
    }
    if (hasInsightView) {
      return `暫無符合「${viewSortHint}」條件的商戶`;
    }
    return isAdmin
      ? "暫無商戶數據，請先在「後臺管理」導入支付後台導出檔案"
      : "暫無商戶數據，請聯繫管理員導入支付後台導出檔案";
  }, [search, salesFilter, hasInsightView, viewSortHint, isAdmin]);

  const pageTitle = isAdmin ? merchantsNavLabel("admin") : merchantsNavLabel(isLeader ? "leader" : "sales");

  const mobileSortOptions = useMemo(
    () =>
      [
        { key: "lastMonthAmount" as const, label: `${rankMonth || "上月"}交易額` },
        { key: "mtdAmount" as const, label: `${currentMonth || "本月"}截至昨日` },
        { key: "dailyAvgChangePercent" as const, label: "日均環比" },
        { key: "cardLimitPercent" as const, label: "刷卡額度%" },
        { key: "scanLimitPercent" as const, label: "掃碼額度%" },
      ].flatMap(({ key, label }) => [
        { value: `${key}:desc`, label: `${label} 高→低` },
        { value: `${key}:asc`, label: `${label} 低→高` },
      ]),
    [rankMonth, currentMonth]
  );

  const filterHint = useMemo(() => {
    const parts: string[] = [];
    if (search.trim()) parts.push(`搜尋「${search.trim()}」`);
    if (salesFilter === "self") parts.push("直屬商戶");
    else if (salesFilter === "unassigned") parts.push("待分配");
    else if (typeof salesFilter === "number") {
      const name =
        merchants.find((m) => m.salesUserId === salesFilter)?.salesName ??
        leaderTeam.find((s) => s.id === salesFilter)?.displayName;
      if (name) parts.push(`銷售 ${name}`);
    }
    return parts.length ? ` · ${parts.join(" · ")}` : "";
  }, [search, salesFilter, merchants, leaderTeam]);

  const colSpan = useInsightToolbar ? 11 : 10;
  const lastMonthColLabel = `${rankMonth || "上月"}交易額`;
  const mtdColLabel = `${currentMonth || "本月"}截至昨日`;

  return (
    <AppShell
      title={pageTitle}
      subtitle={
        rankMonth
          ? `共 ${merchants.length} 家 · 顯示 ${displayed.length} 家${filterHint}`
          : undefined
      }
    >
      <section className="panel">
        <div className="merchant-toolbar">
          <MerchantSearchInput value={search} onChange={setSearch} />
          <div className="merchant-sort-mobile">
            <label className="merchant-filter-label">
              <span className="merchant-filter-label-text">排序</span>
              <div className="merchant-filter-wrap merchant-filter-wrap--wide">
                <select
                  className="merchant-filter-select"
                  value={`${sortKey}:${sortDir}`}
                  aria-label="商戶列表排序"
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(":") as [SortKey, SortDir];
                    setSortKey(key);
                    setSortDir(dir);
                  }}
                >
                  {mobileSortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="merchant-filter-icon" aria-hidden>
                  ↕
                </span>
              </div>
            </label>
          </div>
          {showSalesFilter ? (
            <SalesFilterSelect
              value={salesFilter}
              onChange={setSalesFilter}
              ariaLabel="按所屬銷售篩選"
              showLeaderOptions={isLeader}
              showAdminOptions={isAdmin}
              leaderDisplayName={user?.displayName}
              leaderTeam={leaderTeam}
              adminSalesOptions={adminSalesOptions}
            />
          ) : null}
          {search.trim() || salesFilter !== "all" ? (
            <button
              type="button"
              className="btn btn-sm btn-brutalist-clear"
              onClick={() => {
                setSearch("");
                setSalesFilter("all");
              }}
            >
              清除篩選
            </button>
          ) : null}
        </div>

        {rankMonth && (
          <p className="panel-desc panel-desc-tight">
            {useInsightToolbar ? (
              <>
                默認按{rankMonth}交易額從高到低；可切換新沉默、下跌中、上漲或預警跟進。另顯示{mtdLabel || "本月截至昨日"}
                累計、狀態標籤及額度使用百分比（刷卡/掃碼達 <strong>75%</strong> 標黃、<strong>90%</strong> 標紅）。
              </>
            ) : (
              <>
                點擊表頭可切換排序（預設按{rankMonth}交易額從高到低）；另顯示{mtdLabel || "本月截至昨日"}
                累計、日均環比及額度使用百分比。刷卡或掃碼達 <strong>75%</strong> 標黃、達 <strong>90%</strong>{" "}
                標紅。
              </>
            )}
          </p>
        )}
        {useInsightToolbar && (
          <>
            <div className="detail-tabs sales-rank-tabs">
              {INSIGHT_SORT_BUTTONS.map((btn) => {
                const count =
                  btn.value === "newSilent"
                    ? insightCounts?.newSilent
                    : btn.value === "declining"
                      ? insightCounts?.declining
                      : btn.value === "rising"
                        ? insightCounts?.rising
                        : btn.value === "unreadAlerts"
                          ? insightCounts?.unreadAlerts
                          : undefined;
                return (
                  <button
                    key={btn.value}
                    type="button"
                    className={`detail-tab ${viewSort === btn.value ? "active" : ""}`}
                    onClick={() => setViewSort(btn.value)}
                  >
                    {btn.label}
                    {count !== undefined ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>
            <p className="panel-desc panel-desc-tight muted" style={{ marginTop: 0 }}>
              當前：<strong>{viewSortHint}</strong> — {VIEW_SORT_DESC[viewSort]}
            </p>
          </>
        )}
        {loading ? (
          <PageLoader block />
        ) : (
          <div className="table-wrap table-wrap--stack merchants-insight-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>商戶編號</th>
                  <th>商戶名稱</th>
                  <th>所屬銷售</th>
                  {useInsightToolbar ? (
                    <th className={viewSort === "lastMonthAmount" ? "sort-col-active" : undefined}>
                      {lastMonthColLabel}
                    </th>
                  ) : (
                    <SortableTh
                      label={`${rankMonth || "上月"}交易額`}
                      sortKey="lastMonthAmount"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                  )}
                  <SortableTh
                    label={`${currentMonth || "本月"}截至昨日`}
                    sortKey="mtdAmount"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    title={mtdLabel}
                  />
                  {useInsightToolbar ? (
                    <th
                      className={
                        viewSort === "declining" || viewSort === "rising" ? "sort-col-active" : undefined
                      }
                    >
                      日均環比
                    </th>
                  ) : (
                    <SortableTh
                      label="日均環比"
                      sortKey="dailyAvgChangePercent"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      title="本月日均 vs 上月日均"
                    />
                  )}
                  {useInsightToolbar ? <th>狀態</th> : null}
                  <SortableTh
                    label="刷卡額度%"
                    sortKey="cardLimitPercent"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    title="本月刷卡交易額 ÷ 刷卡單月額度"
                  />
                  <SortableTh
                    label="掃碼額度%"
                    sortKey="scanLimitPercent"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    title="本月掃碼交易額 ÷ 掃碼單月額度"
                  />
                  <th className="data-table-actions" aria-label="操作" />
                </tr>
              </thead>
              <tbody key={useInsightToolbar ? viewSort : `${sortKey}:${sortDir}`}>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="data-table-empty muted" style={{ textAlign: "center", padding: 32 }}>
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  displayed.map((m, i) => {
                    const rowLevel = merchantLimitRowLevel(m);
                    const insightHighlight =
                      useInsightToolbar &&
                      (m.status === "newSilent" || m.status === "declining" || m.hasUnreadAlert);
                    return (
                      <tr
                        key={m.id}
                        className={
                          insightHighlight
                            ? "tiger-row--alert"
                            : rowLevel === "danger"
                              ? "merchant-row--limit-danger"
                              : rowLevel === "warn"
                                ? "merchant-row--limit-warn"
                                : undefined
                        }
                      >
                        <td className="rank-cell" data-label="#">
                          {i + 1}
                        </td>
                        <td className="merchant-code-cell" data-label="商戶編號">
                          {m.merchantCode || "—"}
                        </td>
                        <td data-label="商戶名稱">
                          <strong>{m.name}</strong>
                        </td>
                        <td data-label="所屬銷售">{m.salesName ?? "—"}</td>
                        <td className="amount-cell" data-label={lastMonthColLabel}>
                          {formatHkd(m.lastMonthAmount)}
                        </td>
                        <td className="amount-cell" data-label={mtdColLabel}>
                          {formatHkd(m.mtdAmount)}
                        </td>
                        <td data-label="日均環比">
                          <DailyAvgChange value={m.dailyAvgChangePercent} lastMonthAmount={m.lastMonthAmount} />
                        </td>
                        {useInsightToolbar ? (
                          <td data-label="狀態">
                            <MerchantStatusTag
                              status={m.status}
                              unreadAlertPeriods={m.unreadAlertPeriods}
                            />
                          </td>
                        ) : null}
                        <td data-label="刷卡額度%">
                          <LimitPercent
                            percent={m.cardLimitPercent}
                            used={m.mtdCardAmount}
                            limit={m.cardLimit}
                            label="刷卡"
                          />
                        </td>
                        <td data-label="掃碼額度%">
                          <LimitPercent
                            percent={m.scanLimitPercent}
                            used={m.mtdScanAmount}
                            limit={m.scanLimit}
                            label="掃碼"
                          />
                        </td>
                        <td className="data-table-actions" data-label="操作">
                          <NeoButton size="xs" onClick={() => onOpenMerchant(m.id)}>
                            詳情 →
                          </NeoButton>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
