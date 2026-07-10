import { Fragment, useEffect, useMemo, useState } from "react";
import { api, formatHkd, type TigerTeamSalesRow } from "@/api/client";
import { followUpItemKey } from "@/api/followUp";
import { PageLoader } from "@/components/PageLoader";
import { AppShell } from "@/components/AppShell";
import { SalesFilterSelect } from "@/components/SalesFilterSelect";
import { FollowUpPanel, useFollowUpLatest } from "@/components/FollowUpPanel";
import { UserHeaderActions } from "@/components/UserHeaderActions";
import { useAuth } from "@/context/AuthContext";
import type { SalesFilter } from "@/utils/salesFilter";

interface FailureOrder {
  id: number;
  txnTime: string;
  txnName: string;
  status: string;
  cardRegion: string;
  orderNo: string | null;
  amount: number;
  detail: string | null;
}

interface MerchantGroup {
  merchantId: number;
  merchantName: string;
  merchantCode: string | null;
  salesUserId: number | null;
  salesName: string;
  failureCount: number;
  failureAmount: number;
  latestTime: string;
  refKey: string;
  orders: FailureOrder[];
}

function matchSalesFilter(group: MerchantGroup, filter: SalesFilter, leaderUserId?: number): boolean {
  if (filter === "all") return true;
  if (filter === "self") return group.salesUserId === leaderUserId;
  if (filter === "unassigned") return group.salesUserId == null;
  return group.salesUserId === filter;
}

interface CardFailuresPageProps {
  onBack: () => void;
  onOpenMerchant: (id: number) => void;
  onOpenAdmin?: () => void;
  onOpenUserCenter?: () => void;
}

export function CardFailuresPage({
  onBack,
  onOpenMerchant,
  onOpenAdmin,
  onOpenUserCenter,
}: CardFailuresPageProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isLeader = user?.role === "leader";
  const showSalesFilter = isAdmin || isLeader;
  const showSalesColumn = showSalesFilter;
  const [groups, setGroups] = useState<MerchantGroup[]>([]);
  const [leaderTeam, setLeaderTeam] = useState<TigerTeamSalesRow[]>([]);
  const [salesFilter, setSalesFilter] = useState<SalesFilter>("all");
  const [summary, setSummary] = useState({
    merchantCount: 0,
    failureCount: 0,
    days: 3,
    rangeLabel: "",
  });
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{ groups: MerchantGroup[]; summary: typeof summary }>("/card-failures")
      .then((data) => {
        setGroups(data.groups);
        setSummary(data.summary);
        const init: Record<number, boolean> = {};
        data.groups.slice(0, 3).forEach((g) => {
          init[g.merchantId] = true;
        });
        setExpanded(init);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isLeader) return;
    api<{ sales: TigerTeamSalesRow[] }>("/leader/team")
      .then((data) => setLeaderTeam(data.sales))
      .catch(() => setLeaderTeam([]));
  }, [isLeader]);

  const adminSalesOptions = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<number | "unassigned", string>();
    for (const g of groups) {
      if (g.salesUserId == null) {
        map.set("unassigned", "待分配");
      } else {
        map.set(g.salesUserId, g.salesName?.trim() || `用戶 #${g.salesUserId}`);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  }, [isAdmin, groups]);

  const displayed = useMemo(
    () => groups.filter((g) => matchSalesFilter(g, salesFilter, user?.id)),
    [groups, salesFilter, user?.id]
  );

  const filterHint = useMemo(() => {
    if (salesFilter === "all") return "";
    if (salesFilter === "self") return " · 直屬商戶";
    if (salesFilter === "unassigned") return " · 待分配";
    const name =
      groups.find((g) => g.salesUserId === salesFilter)?.salesName ??
      leaderTeam.find((s) => s.id === salesFilter)?.displayName;
    return name ? ` · 銷售 ${name}` : "";
  }, [salesFilter, groups, leaderTeam]);

  const toggle = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const colSpan = showSalesColumn ? 10 : 9;

  const followUpItems = useMemo(
    () =>
      displayed.map((g) => ({
        merchantId: g.merchantId,
        type: "failure" as const,
        refKey: g.refKey,
      })),
    [displayed]
  );
  const { latest: followUpLatest, refresh: refreshFollowUps } = useFollowUpLatest(followUpItems);

  const pageTitle = isLeader ? "交易失敗（我的與團隊）" : "交易失敗";

  return (
    <AppShell
      title={pageTitle}
      subtitle={`${summary.rangeLabel || "近3日"} · ${summary.failureCount} 筆 · ${summary.merchantCount} 家商戶${filterHint}`}
      onBack={onBack}
      actions={<UserHeaderActions onOpenAdmin={onOpenAdmin} onOpenUserCenter={onOpenUserCenter} />}
    >
      <section className="panel">
        <p className="panel-desc">
          統計<strong>不含今天</strong>的連續 3 個自然日（昨天、前天、大前天），按商戶匯總
          <strong>狀態非「成功」</strong>的訂單，依失敗筆數從高到低排名。重新導入含失敗狀態的支付後台文件即可更新。
        </p>

        {showSalesFilter ? (
          <div className="merchant-toolbar" style={{ marginBottom: 12 }}>
            <SalesFilterSelect
              value={salesFilter}
              onChange={setSalesFilter}
              ariaLabel="按所屬銷售篩選交易失敗"
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

        {loading ? (
          <PageLoader block />
        ) : displayed.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✓</div>
            <p>
              {groups.length === 0
                ? `${summary.rangeLabel || "近 3 日"}暫無交易失敗記錄`
                : "目前篩選條件下暫無記錄"}
            </p>
            <p className="muted" style={{ marginTop: 8, fontSize: "0.85rem" }}>
              若支付後台有失敗單，請在「後臺管理」重新導入含失敗狀態的明細
            </p>
          </div>
        ) : (
          <div className="table-wrap table-wrap--stack">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>商戶編號</th>
                  <th>商戶名稱</th>
                  {showSalesColumn && <th>銷售</th>}
                  <th>3日失敗筆數</th>
                  <th>3日失敗金額</th>
                  <th>最近失敗</th>
                  <th>跟進</th>
                  <th className="data-table-actions" aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {displayed.map((g, i) => {
                  const isTeamMerchant =
                    isLeader && g.salesUserId != null && g.salesUserId !== user?.id;
                  return (
                    <Fragment key={g.merchantId}>
                      <tr key={g.merchantId} className="txn-fail-row">
                        <td className="rank-cell" data-label="#">
                          {i + 1}
                        </td>
                        <td className="merchant-code-cell" data-label="商戶編號">
                          {g.merchantCode || "—"}
                        </td>
                        <td data-label="商戶名稱">
                          <strong>{g.merchantName}</strong>
                        </td>
                        {showSalesColumn && <td data-label="銷售">{g.salesName}</td>}
                        <td data-label="3日失敗筆數">
                          <span className="card-failure-count">{g.failureCount} 筆</span>
                        </td>
                        <td className="amount-cell" data-label="3日失敗金額">
                          {formatHkd(g.failureAmount)}
                        </td>
                        <td
                          data-label="最近失敗"
                          style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}
                        >
                          {new Date(g.latestTime).toLocaleString("zh-HK", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td data-label="跟進">
                          <FollowUpPanel
                            merchantId={g.merchantId}
                            merchantName={g.merchantName}
                            type="failure"
                            refKey={g.refKey}
                            ownerSalesUserId={g.salesUserId}
                            latest={
                              followUpLatest[followUpItemKey(g.merchantId, "failure", g.refKey)]
                            }
                            onUpdated={refreshFollowUps}
                            compact
                            viewOnly={isAdmin || isTeamMerchant}
                          />
                        </td>
                        <td className="txn-fail-actions data-table-actions" data-label="操作">
                          <button type="button" className="link-btn" onClick={() => toggle(g.merchantId)}>
                            {expanded[g.merchantId] ? "收起 ▾" : "明細 ▸"}
                          </button>
                          <button type="button" className="link-btn" onClick={() => onOpenMerchant(g.merchantId)}>
                            商戶 →
                          </button>
                        </td>
                      </tr>
                      {expanded[g.merchantId] && (
                        <tr key={`${g.merchantId}-detail`} className="txn-fail-detail-row">
                          <td colSpan={colSpan}>
                            <div className="table-wrap">
                              <table className="data-table data-table-compact">
                                <thead>
                                  <tr>
                                    <th>時間</th>
                                    <th>交易</th>
                                    <th>狀態</th>
                                    <th>卡歸屬地</th>
                                    <th>訂單號</th>
                                    <th>金額</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.orders.map((o) => (
                                    <tr key={o.id}>
                                      <td
                                        style={{
                                          whiteSpace: "nowrap",
                                          color: "var(--text-secondary)",
                                        }}
                                      >
                                        {new Date(o.txnTime).toLocaleString("zh-HK")}
                                      </td>
                                      <td>{o.txnName}</td>
                                      <td>
                                        <span className="status-fail">{o.status}</span>
                                      </td>
                                      <td>{o.cardRegion}</td>
                                      <td style={{ fontSize: "0.8rem" }}>{o.orderNo ?? "—"}</td>
                                      <td className="amount-cell">
                                        {o.amount ? formatHkd(o.amount) : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
