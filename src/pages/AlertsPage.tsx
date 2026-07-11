import { useEffect, useMemo, useState } from "react";
import { api, type Alert, type AlertOversightSummary, type SalesAccountabilityRow, type TigerTeamSalesRow } from "@/api/client";
import { getMainScrollTop, scrollMainTo } from "@/utils/mainScroll";
import { AlertListSection, countAlertReadState } from "@/components/AlertListSection";
import { AlertOversightBar } from "@/components/AlertOversightBar";
import { SalesAccountabilityPanel } from "@/components/SalesAccountabilityPanel";
import { type AlertStatusFilter } from "@/components/AlertReadFilterTabs";
import { AppShell } from "@/components/AppShell";
import { SalesFilterSelect } from "@/components/SalesFilterSelect";
import { useFollowUpLatest } from "@/components/FollowUpPanel";
import { useAuth } from "@/context/AuthContext";
import type { SalesOversightContext } from "@/pages/SalesOversightDetailPage";
import type { SalesFilter } from "@/utils/salesFilter";

const ALERT_PERIOD_LABEL = { week: "週", month: "月" } as const;

interface AlertsPageProps {
  onOpenMerchant: (id: number) => void;
  onOpenSalesOversight?: (ctx: SalesOversightContext) => void;
  initialAdminView?: "list" | "sales";
}

function matchSalesFilter(alert: Alert, filter: SalesFilter, leaderUserId?: number): boolean {
  if (filter === "all") return true;
  if (filter === "self") return alert.sales_user_id === leaderUserId;
  if (filter === "unassigned") return alert.sales_user_id == null;
  return alert.sales_user_id === filter;
}

export function AlertsPage({
  onOpenMerchant,
  onOpenSalesOversight,
  initialAdminView,
}: AlertsPageProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isLeader = user?.role === "leader";
  const showSalesFilter = isAdmin || isLeader;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [leaderTeam, setLeaderTeam] = useState<TigerTeamSalesRow[]>([]);
  const [periodFilter, setPeriodFilter] = useState<"" | "week" | "month">("");
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("");
  const [salesFilter, setSalesFilter] = useState<SalesFilter>("all");
  const [loading, setLoading] = useState(true);
  const [adminView, setAdminView] = useState<"list" | "sales">(initialAdminView ?? "list");
  const [oversight, setOversight] = useState<AlertOversightSummary | null>(null);
  const [accountabilityRows, setAccountabilityRows] = useState<SalesAccountabilityRow[]>([]);
  const [accountabilityLoading, setAccountabilityLoading] = useState(false);

  const load = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    const scrollY = silent ? getMainScrollTop() : null;
    if (!silent) setLoading(true);
    try {
      const q = periodFilter ? `?period=${periodFilter}` : "";
      const data = await api<{ alerts: Alert[] }>(`/alerts${q}`);
      setAlerts(data.alerts);
    } finally {
      if (!silent) setLoading(false);
      else if (scrollY != null) {
        requestAnimationFrame(() => scrollMainTo(scrollY));
      }
    }
  };

  useEffect(() => {
    load();
  }, [periodFilter]);

  useEffect(() => {
    if (initialAdminView) setAdminView(initialAdminView);
  }, [initialAdminView]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = periodFilter ? `?period=${periodFilter}` : "";
    api<{ summary: AlertOversightSummary }>(`/alerts/oversight${q}`)
      .then((data) => setOversight(data.summary))
      .catch(() => setOversight(null));
  }, [isAdmin, periodFilter, alerts]);

  useEffect(() => {
    if (!isAdmin || adminView !== "sales") return;
    setAccountabilityLoading(true);
    const q = periodFilter ? `?period=${periodFilter}` : "";
    api<{ rows: SalesAccountabilityRow[] }>(`/alerts/sales-accountability${q}`)
      .then((data) => setAccountabilityRows(data.rows))
      .catch(() => setAccountabilityRows([]))
      .finally(() => setAccountabilityLoading(false));
  }, [isAdmin, adminView, periodFilter, alerts]);

  useEffect(() => {
    if (!isLeader) return;
    api<{ sales: TigerTeamSalesRow[] }>("/leader/team")
      .then((data) => setLeaderTeam(data.sales))
      .catch(() => setLeaderTeam([]));
  }, [isLeader]);

  const adminSalesOptions = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<number | "unassigned", string>();
    for (const a of alerts) {
      if (a.sales_user_id == null) {
        map.set("unassigned", "待分配");
      } else {
        map.set(a.sales_user_id, a.sales_name?.trim() || `用戶 #${a.sales_user_id}`);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  }, [isAdmin, alerts]);

  const salesFiltered = useMemo(
    () => alerts.filter((a) => matchSalesFilter(a, salesFilter, user?.id)),
    [alerts, salesFilter, user?.id]
  );

  const { unread, total } = countAlertReadState(salesFiltered);

  const followUpItems = useMemo(
    () =>
      salesFiltered
        .filter((a) => a.ref_key)
        .map((a) => ({
          merchantId: a.merchant_id,
          type: "alert" as const,
          refKey: a.ref_key!,
        })),
    [salesFiltered]
  );
  const { latest: followUpLatest, refresh: refreshFollowUps } = useFollowUpLatest(followUpItems);

  const filterHint = useMemo(() => {
    if (salesFilter === "all") return "";
    if (salesFilter === "self") return " · 直屬商戶";
    if (salesFilter === "unassigned") return " · 待分配";
    const name =
      alerts.find((a) => a.sales_user_id === salesFilter)?.sales_name ??
      leaderTeam.find((s) => s.id === salesFilter)?.displayName;
    return name ? ` · 銷售 ${name}` : "";
  }, [salesFilter, alerts, leaderTeam]);

  return (
    <AppShell
      title="交易預警"
      subtitle={`${user?.displayName} · ${unread} 條未跟進 / 共 ${total} 條${isLeader ? " · 團隊範圍" : ""}${filterHint}`}
    >
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">{isAdmin ? "預警督辦" : "預警列表"}</h2>
          <div className="tabs tabs-scroll">
            {(["", "week", "month"] as const).map((p) => (
              <button
                key={p || "all-period"}
                type="button"
                className={`tab${periodFilter === p ? " active" : ""}`}
                onClick={() => setPeriodFilter(p)}
              >
                {p ? `${ALERT_PERIOD_LABEL[p]}環比` : "全部週期"}
              </button>
            ))}
          </div>
        </div>

        {isAdmin && oversight ? (
          <AlertOversightBar
            summary={oversight}
            activeFilter={statusFilter}
            onFilterChange={(filter) => {
              setStatusFilter(filter);
              setAdminView("list");
            }}
          />
        ) : null}

        {isAdmin ? (
          <div className="tabs tabs-secondary tabs-scroll" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab${adminView === "list" ? " active" : ""}`}
              onClick={() => setAdminView("list")}
            >
              預警列表
            </button>
            <button
              type="button"
              className={`tab${adminView === "sales" ? " active" : ""}`}
              onClick={() => setAdminView("sales")}
            >
              銷售督辦榜
            </button>
          </div>
        ) : null}

        {isAdmin && adminView === "sales" ? (
          <SalesAccountabilityPanel
            rows={accountabilityRows}
            loading={accountabilityLoading}
            onViewSales={(salesUserId, salesName) => {
              if (!onOpenSalesOversight) return;
              onOpenSalesOversight({
                salesUserId,
                salesName,
                periodFilter,
              });
            }}
          />
        ) : (
          <>
            {showSalesFilter ? (
              <div className="merchant-toolbar" style={{ marginBottom: 12 }}>
                <SalesFilterSelect
                  value={salesFilter}
                  onChange={setSalesFilter}
                  ariaLabel="按所屬銷售篩選預警"
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

            <AlertListSection
              alerts={salesFiltered}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              loading={loading}
              currentUserId={user?.id}
              showAdminRepliedTab={isAdmin || isLeader}
              showLeaderReadTab={isLeader}
              showSalesTag={isAdmin || isLeader}
              showProgressSteps={isAdmin || isLeader}
              showLeaderProgress={isAdmin}
              onOpenMerchant={onOpenMerchant}
              followUpLatest={followUpLatest}
              onFollowUpUpdated={() => {
                refreshFollowUps();
                load({ silent: true });
              }}
              onAcknowledged={() => load({ silent: true })}
              onLeaderRead={() => load({ silent: true })}
              emptyDefaultMessage="暫無預警，商戶交易正常"
              showFollowUpHint={!isAdmin}
            />
          </>
        )}
      </section>
    </AppShell>
  );
}
