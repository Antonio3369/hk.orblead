import { useEffect, useMemo, useState } from "react";
import {
  api,
  formatHkd,
  formatHkdWan,
  MASTERCARD_LIFETIME_ALERT_HKD,
  MASTERCARD_LIFETIME_WARN_HKD,
  MASTERCARD_RANK_MIN_LIST_HKD,
  type MerchantMastercardRankRow,
  type TigerTeamSalesRow,
} from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { PageLoader } from "@/components/PageLoader";
import { SalesFilterSelect } from "@/components/SalesFilterSelect";
import { useAuth } from "@/context/AuthContext";
import type { SalesFilter } from "@/utils/salesFilter";

interface MastercardRankPageProps {
  onOpenMerchant: (id: number) => void;
}

function matchSalesFilter(
  row: MerchantMastercardRankRow,
  filter: SalesFilter,
  leaderUserId?: number
): boolean {
  if (filter === "all") return true;
  if (filter === "self") return row.salesUserId === leaderUserId;
  if (filter === "unassigned") return row.salesUserId == null;
  return row.salesUserId === filter;
}

function formatWanThresholdLabel(hkd: number): string {
  const wan = hkd / 10_000;
  return Number.isInteger(wan) ? `${wan}萬` : `${wan.toFixed(1)}萬`;
}

function formatMastercardTxnTime(value: string | null): string {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-HK", { hour12: false });
}

function rowHighlightClass(m: MerchantMastercardRankRow): string | undefined {
  if (m.reachedAlert) return "mastercard-rank-row--alert";
  if (m.reachedWarn) return "mastercard-rank-row--warn";
  return undefined;
}

export function MastercardRankPage({ onOpenMerchant }: MastercardRankPageProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isLeader = user?.role === "leader";
  const showSalesFilter = isAdmin || isLeader;
  const [merchants, setMerchants] = useState<MerchantMastercardRankRow[]>([]);
  const [warnThreshold, setWarnThreshold] = useState(MASTERCARD_LIFETIME_WARN_HKD);
  const [alertThreshold, setAlertThreshold] = useState(MASTERCARD_LIFETIME_ALERT_HKD);
  const [minListThreshold, setMinListThreshold] = useState(MASTERCARD_RANK_MIN_LIST_HKD);
  const [leaderTeam, setLeaderTeam] = useState<TigerTeamSalesRow[]>([]);
  const [salesFilter, setSalesFilter] = useState<SalesFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{
      minListThreshold: number;
      warnThreshold: number;
      alertThreshold: number;
      merchants: MerchantMastercardRankRow[];
    }>("/merchants/mastercard-ranking")
      .then((data) => {
        setMerchants(data.merchants);
        setMinListThreshold(data.minListThreshold);
        setWarnThreshold(data.warnThreshold);
        setAlertThreshold(data.alertThreshold);
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

  const filtered = useMemo(
    () => merchants.filter((m) => matchSalesFilter(m, salesFilter, user?.id)),
    [merchants, salesFilter, user?.id]
  );

  const warnOnlyCount = filtered.filter((m) => m.reachedWarn && !m.reachedAlert).length;
  const alertCount = filtered.filter((m) => m.reachedAlert).length;

  const filterHint = useMemo(() => {
    if (salesFilter === "all") return "";
    if (salesFilter === "self") return " · 直屬商戶";
    if (salesFilter === "unassigned") return " · 待分配";
    const name =
      merchants.find((m) => m.salesUserId === salesFilter)?.salesName ??
      leaderTeam.find((s) => s.id === salesFilter)?.displayName;
    return name ? ` · 銷售 ${name}` : "";
  }, [salesFilter, merchants, leaderTeam]);

  return (
    <AppShell
      title="Mastercard 商戶排名"
      subtitle={`歷史累計 · ${formatHkdWan(warnThreshold / 10000)} 標黃 · ${formatHkdWan(alertThreshold / 10000)} 標紅${filterHint}`}
    >
      <section className="panel">
        <div className="panel-intro">
          <h2 className="panel-title">萬事達交易累計排名</h2>
          <p className="panel-desc">
            按<strong>歷史以來</strong> Mastercard（萬事達）成功交易累計金額從高到低排列，
            僅顯示累計達 <strong>{formatHkd(minListThreshold)}</strong> 及以上的商戶。
            累計達 <strong>{formatHkd(warnThreshold)}</strong> 及以上以<strong>黃色預警</strong>標示，
            達 <strong>{formatHkd(alertThreshold)}</strong> 及以上以<strong>紅色</strong>標示；
            標黃／標紅商戶另顯示<strong>最後 Mastercard 交易時間</strong>。
          </p>
        </div>

        {showSalesFilter ? (
          <div className="merchant-toolbar" style={{ marginBottom: 12 }}>
            <SalesFilterSelect
              value={salesFilter}
              onChange={setSalesFilter}
              ariaLabel="按所屬銷售篩選 Mastercard 排名"
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
        ) : filtered.length === 0 ? (
          <p className="muted">暫無累計達 {formatHkd(minListThreshold)} 及以上的 Mastercard 商戶。</p>
        ) : (
          <>
            <p className="panel-desc panel-desc-tight mastercard-rank-summary">
              共 {filtered.length} 家商戶 · {warnOnlyCount} 家標黃預警 · {alertCount} 家標紅
            </p>
            <div className="table-wrap">
              <table className="data-table mastercard-rank-table">
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>商戶</th>
                    {showSalesFilter ? <th>歸屬銷售</th> : null}
                    <th>累計 Mastercard 交易額</th>
                    <th>最後交易</th>
                    <th>筆數</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr
                      key={m.id}
                      className={rowHighlightClass(m)}
                      data-list-anchor-merchant={m.id}
                    >
                      <td data-label="排名">{m.rank}</td>
                      <td data-label="商戶">
                        <button type="button" className="link-btn" onClick={() => onOpenMerchant(m.id)}>
                          {m.name}
                        </button>
                        {m.merchantCode ? (
                          <span className="muted mastercard-rank-code">{m.merchantCode}</span>
                        ) : null}
                      </td>
                      {showSalesFilter ? (
                        <td data-label="歸屬銷售">{m.salesName ?? "待分配"}</td>
                      ) : null}
                      <td data-label="累計 Mastercard 交易額">
                        <strong>{formatHkd(m.lifetimeAmount)}</strong>
                        {m.reachedAlert ? (
                          <span className="mastercard-rank-badge mastercard-rank-badge--alert">
                            ≥{formatWanThresholdLabel(alertThreshold)}
                          </span>
                        ) : m.reachedWarn ? (
                          <span className="mastercard-rank-badge mastercard-rank-badge--warn">
                            ≥{formatWanThresholdLabel(warnThreshold)}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="最後交易">
                        {m.reachedWarn || m.reachedAlert ? (
                          <span className="mastercard-rank-last-txn">
                            {formatMastercardTxnTime(m.lastMastercardTxnTime)}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td data-label="筆數">{m.txnCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
