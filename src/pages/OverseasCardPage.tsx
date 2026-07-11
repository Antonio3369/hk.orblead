import { Fragment, useEffect, useMemo, useState } from "react";
import {
  api,
  formatHkd,
  type OverseasCardOverview,
  type OverseasCardRepeatGroup,
  type TigerTeamSalesRow,
} from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { PageLoader } from "@/components/PageLoader";
import { SalesFilterSelect } from "@/components/SalesFilterSelect";
import { useAuth } from "@/context/AuthContext";
import type { SalesFilter } from "@/utils/salesFilter";

interface OverseasCardPageProps {
  onOpenMerchant: (id: number) => void;
}

function schemeLabel(scheme: "visa" | "mastercard" | "unionpay"): string {
  if (scheme === "visa") return "Visa";
  if (scheme === "mastercard") return "Mastercard";
  return "銀聯";
}

function formatTxnTime(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-HK", { hour12: false });
}

function matchSalesFilter(
  salesUserId: number | null | undefined,
  filter: SalesFilter,
  leaderUserId?: number
): boolean {
  if (filter === "all") return true;
  if (filter === "self") return salesUserId === leaderUserId;
  if (filter === "unassigned") return salesUserId == null;
  return salesUserId === filter;
}

export function OverseasCardPage({ onOpenMerchant }: OverseasCardPageProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isLeader = user?.role === "leader";
  const showSalesFilter = isAdmin || isLeader;
  const [data, setData] = useState<OverseasCardOverview | null>(null);
  const [leaderTeam, setLeaderTeam] = useState<TigerTeamSalesRow[]>([]);
  const [salesFilter, setSalesFilter] = useState<SalesFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<OverseasCardOverview>("/overseas-cards/overview")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isLeader) return;
    api<{ sales: TigerTeamSalesRow[] }>("/leader/team")
      .then((r) => setLeaderTeam(r.sales))
      .catch(() => setLeaderTeam([]));
  }, [isLeader]);

  const monthMerchants = useMemo(
    () =>
      (data?.lastMonthRank.merchants ?? []).filter((m) =>
        matchSalesFilter(m.salesUserId, salesFilter, user?.id)
      ),
    [data, salesFilter, user?.id]
  );

  const repeatGroups = useMemo(
    () =>
      (data?.repeatCardHits.groups ?? []).filter((g) =>
        matchSalesFilter(g.salesUserId, salesFilter, user?.id)
      ),
    [data, salesFilter, user?.id]
  );

  const largeTxns = useMemo(
    () =>
      (data?.largeTransactions.transactions ?? []).filter((t) =>
        matchSalesFilter(t.salesUserId, salesFilter, user?.id)
      ),
    [data, salesFilter, user?.id]
  );

  const adminSalesOptions = useMemo(() => {
    if (!isAdmin || !data) return [];
    const map = new Map<number | "unassigned", string>();
    for (const row of [
      ...data.lastMonthRank.merchants,
      ...data.repeatCardHits.groups,
      ...data.largeTransactions.transactions,
    ]) {
      const salesUserId = "salesUserId" in row ? row.salesUserId : null;
      const salesName = "salesName" in row ? row.salesName : null;
      if (salesUserId == null) map.set("unassigned", "待分配");
      else map.set(salesUserId, salesName?.trim() || `用戶 #${salesUserId}`);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  }, [isAdmin, data]);

  const toggleRepeat = (group: OverseasCardRepeatGroup) => {
    const key = `${group.merchantId}-${group.scheme}-${group.cardNo}`;
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading || !data) {
    return (
      <AppShell title="境外卡交易" subtitle="Visa · Mastercard · 銀聯">
        <PageLoader block />
      </AppShell>
    );
  }

  const { thresholds } = data;

  return (
    <AppShell title="境外卡交易" subtitle="Visa · Mastercard · 銀聯">
      {showSalesFilter ? (
        <div className="merchant-toolbar overseas-card-toolbar">
          <SalesFilterSelect
            value={salesFilter}
            onChange={setSalesFilter}
            ariaLabel="按所屬銷售篩選境外卡交易"
            showLeaderOptions={isLeader}
            showAdminOptions={isAdmin}
            leaderDisplayName={user?.displayName}
            leaderTeam={leaderTeam}
            adminSalesOptions={adminSalesOptions}
          />
          {salesFilter !== "all" ? (
            <button
              type="button"
              className="btn btn-sm btn-brutalist-clear"
              onClick={() => setSalesFilter("all")}
            >
              清除篩選
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-intro">
          <h2 className="panel-title">上月境外卡交易排名 · Top {data.lastMonthRank.rankLimit}</h2>
          <p className="panel-desc panel-desc-tight">
            {data.lastMonthRank.rankMonth} · {data.lastMonthRank.scopeNote} · 全機構合計{" "}
            {formatHkd(data.lastMonthRank.orgTotal)}
          </p>
        </div>
        {monthMerchants.length === 0 ? (
          <p className="muted">暫無上月境外卡交易記錄。</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>商戶</th>
                  {showSalesFilter ? <th>歸屬銷售</th> : null}
                  <th>境外卡交易額</th>
                  <th>占該商戶上月</th>
                  <th>筆數</th>
                </tr>
              </thead>
              <tbody>
                {monthMerchants.map((m, index) => (
                  <tr key={m.id} data-list-anchor-merchant={m.id}>
                    <td data-label="排名">{index + 1}</td>
                    <td data-label="商戶">
                      <button type="button" className="link-btn" onClick={() => onOpenMerchant(m.id)}>
                        {m.name}
                      </button>
                    </td>
                    {showSalesFilter ? <td data-label="歸屬銷售">{m.salesName ?? "待分配"}</td> : null}
                    <td data-label="境外卡交易額">
                      <strong>{formatHkd(m.totalAmount)}</strong>
                    </td>
                    <td data-label="占該商戶上月">
                      {m.sharePercent.toFixed(1)}%
                      <span className="muted overseas-share-meta">
                        / {formatHkd(m.merchantLastMonthTotal)}
                      </span>
                    </td>
                    <td data-label="筆數">{m.txnCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-intro">
          <h2 className="panel-title">同卡多筆交易（近 3 日）</h2>
          <p className="panel-desc panel-desc-tight">
            {data.repeatCardHits.rangeLabel} · 僅統計<strong>交易成功</strong>的消費（不含交易失敗） ·
            同一商戶 + 同一 Visa / Mastercard 卡號 · 單筆{" "}
            {formatHkd(thresholds.repeatBandMinHkd)}–{formatHkd(thresholds.repeatBandMaxHkd)} · ≥{" "}
            {thresholds.repeatMinTxnCount} 筆
          </p>
        </div>
        {repeatGroups.length === 0 ? (
          <p className="muted">
            近 3 日暫無符合條件的多筆交易。若長期為空，請確認機構報表已導入並帶有卡號欄位。
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table overseas-repeat-table">
              <thead>
                <tr>
                  <th />
                  <th>排名</th>
                  <th>商戶</th>
                  {showSalesFilter ? <th>歸屬銷售</th> : null}
                  <th>卡種</th>
                  <th>卡號</th>
                  <th>命中筆數</th>
                  <th>區間合計</th>
                </tr>
              </thead>
              <tbody>
                {repeatGroups.map((group, index) => {
                  const key = `${group.merchantId}-${group.scheme}-${group.cardNo}`;
                  const open = !!expanded[key];
                  return (
                    <Fragment key={key}>
                      <tr className="overseas-repeat-row">
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost overseas-repeat-toggle"
                            onClick={() => toggleRepeat(group)}
                            aria-expanded={open}
                          >
                            {open ? "收起" : "明細"}
                          </button>
                        </td>
                        <td data-label="排名">{index + 1}</td>
                        <td data-label="商戶">
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => onOpenMerchant(group.merchantId)}
                          >
                            {group.merchantName}
                          </button>
                        </td>
                        {showSalesFilter ? (
                          <td data-label="歸屬銷售">{group.salesName ?? "待分配"}</td>
                        ) : null}
                        <td data-label="卡種">{schemeLabel(group.scheme)}</td>
                        <td data-label="卡號">
                          <code className="overseas-card-no">{group.cardNo}</code>
                        </td>
                        <td data-label="命中筆數">{group.hitCount}</td>
                        <td data-label="區間合計">
                          <strong>{formatHkd(group.bandAmount)}</strong>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="overseas-repeat-detail-row">
                          <td colSpan={showSalesFilter ? 8 : 7}>
                            <table className="data-table data-table--nested">
                              <thead>
                                <tr>
                                  <th>交易時間</th>
                                  <th>金額</th>
                                  <th>訂單號</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.transactions.map((txn) => (
                                  <tr key={txn.id}>
                                    <td>{formatTxnTime(txn.txnTime)}</td>
                                    <td>{formatHkd(txn.amount)}</td>
                                    <td>{txn.orderNo ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-intro">
          <h2 className="panel-title">大額單筆交易（近 3 日）</h2>
          <p className="panel-desc panel-desc-tight">
            {data.largeTransactions.rangeLabel} · 僅統計<strong>交易成功</strong>消費 · 單筆 ≥{" "}
            {formatHkd(thresholds.largeTxnMinHkd)} · Visa / Mastercard / 銀聯
          </p>
        </div>
        {largeTxns.length === 0 ? (
          <p className="muted">近 3 日暫無符合條件的大額境外卡交易。</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>商戶</th>
                  {showSalesFilter ? <th>歸屬銷售</th> : null}
                  <th>卡種</th>
                  <th>交易時間</th>
                  <th>金額</th>
                  <th>卡號</th>
                </tr>
              </thead>
              <tbody>
                {largeTxns.map((txn, index) => (
                  <tr key={txn.id}>
                    <td data-label="排名">{index + 1}</td>
                    <td data-label="商戶">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => onOpenMerchant(txn.merchantId)}
                      >
                        {txn.merchantName}
                      </button>
                    </td>
                    {showSalesFilter ? (
                      <td data-label="歸屬銷售">{txn.salesName ?? "待分配"}</td>
                    ) : null}
                    <td data-label="卡種">{schemeLabel(txn.scheme)}</td>
                    <td data-label="交易時間">{formatTxnTime(txn.txnTime)}</td>
                    <td data-label="金額">
                      <strong>{formatHkd(txn.amount)}</strong>
                    </td>
                    <td data-label="卡號">
                      {txn.cardNo ? <code className="overseas-card-no">{txn.cardNo}</code> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
