import { useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AdminPage } from "@/pages/AdminPage";
import { AlertsPage } from "@/pages/AlertsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { MerchantPage } from "@/pages/MerchantPage";
import { MerchantsPage } from "@/pages/MerchantsPage";
import { CardFailuresPage } from "@/pages/CardFailuresPage";
import { TigerTeamPage } from "@/pages/TigerTeamPage";
import { TigerTeamSalesPage } from "@/pages/TigerTeamSalesPage";
import { SalesOversightDetailPage, type SalesOversightContext } from "@/pages/SalesOversightDetailPage";
import { UserCenterPage } from "@/pages/UserCenterPage";
import { SalesInsightSummaryPage } from "@/pages/SalesInsightSummaryPage";
import { PageLoader } from "@/components/PageLoader";
import type { MerchantListSortKey } from "@/api/client";

type MainView =
  | "dashboard"
  | "alerts"
  | "cardFailures"
  | "admin"
  | "tigerTeam"
  | "leaderTeam"
  | "userCenter"
  | "insightSummary";

type MerchantsView = { type: "merchants"; viewSort?: MerchantListSortKey };
type TeamSalesFrom = "tigerTeamSales" | "leaderTeamSales";
type MerchantFrom = MainView | MerchantsView["type"] | TeamSalesFrom | "salesOversightDetail";

type View =
  | { type: MainView }
  | MerchantsView
  | { type: "alerts"; adminTab?: "list" | "sales" }
  | { type: TeamSalesFrom; salesUserId: number }
  | ({ type: "salesOversightDetail" } & SalesOversightContext)
  | {
      type: "merchant";
      id: number;
      from: MerchantFrom;
      salesUserId?: number;
      salesOversight?: SalesOversightContext;
    };

type ListScrollKey = "alerts" | "merchants" | "cardFailures";

function isListScrollKey(from: MerchantFrom): from is ListScrollKey {
  return from === "alerts" || from === "merchants" || from === "cardFailures";
}

function listScrollStorageKey(from: ListScrollKey): string {
  return `merchant-agent:list-scroll:${from}`;
}

function readListScroll(from: ListScrollKey, cache: Partial<Record<ListScrollKey, number>>): number {
  if (cache[from] != null) return cache[from]!;
  const stored = sessionStorage.getItem(listScrollStorageKey(from));
  const parsed = stored == null ? 0 : Number(stored);
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeListScroll(from: ListScrollKey, y: number, cache: Partial<Record<ListScrollKey, number>>) {
  cache[from] = y;
  sessionStorage.setItem(listScrollStorageKey(from), String(y));
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>({ type: "dashboard" });
  const listScrollRef = useRef<Partial<Record<ListScrollKey, number>>>({});
  const restoreScrollKeyRef = useRef<ListScrollKey | null>(null);
  const listAnchorRef = useRef<{ key: ListScrollKey; merchantId: number } | null>(null);
  const prevUserIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      prevUserIdRef.current = null;
      setView({ type: "dashboard" });
      return;
    }
    if (prevUserIdRef.current !== user.id) {
      setView({ type: "dashboard" });
    }
    prevUserIdRef.current = user.id;
  }, [user]);

  useEffect(() => {
    const key = restoreScrollKeyRef.current;
    if (!key || view.type !== key) return;
    const y = readListScroll(key, listScrollRef.current);
    const anchor =
      listAnchorRef.current?.key === key ? listAnchorRef.current.merchantId : null;
    restoreScrollKeyRef.current = null;
    listAnchorRef.current = null;

    const restore = () => {
      window.scrollTo(0, y);
      if (anchor != null) {
        const el = document.querySelector(`[data-list-anchor-merchant="${anchor}"]`);
        if (el) el.scrollIntoView({ block: "center" });
      }
    };
    restore();
    const timers = [0, 50, 150, 400, 800].map((ms) => window.setTimeout(restore, ms));
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      restore();
      raf2 = requestAnimationFrame(restore);
    });
    return () => {
      timers.forEach((id) => clearTimeout(id));
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [view]);

  if (loading) {
    return <PageLoader fullPage />;
  }

  if (!user) {
    return <LoginPage />;
  }

  const openAdmin = user.role === "admin" ? () => setView({ type: "admin" }) : undefined;
  const openTigerTeam = user.role === "admin" ? () => setView({ type: "tigerTeam" }) : undefined;
  const openLeaderTeam = user.role === "leader" ? () => setView({ type: "leaderTeam" }) : undefined;
  const openUserCenter = () => setView({ type: "userCenter" });
  const openMerchants = (viewSort?: MerchantListSortKey) => {
    window.scrollTo(0, 0);
    setView({ type: "merchants", viewSort });
  };

  const openMerchant = (
    id: number,
    from: MerchantFrom = "dashboard",
    ctx?: number | SalesOversightContext
  ) => {
    if (from === "salesOversightDetail") {
      const salesOversight = ctx as SalesOversightContext;
      window.scrollTo(0, 0);
      setView({ type: "merchant", id, from, salesOversight });
      return;
    }

    const salesUserId = typeof ctx === "number" ? ctx : undefined;
    if (isListScrollKey(from)) {
      writeListScroll(from, window.scrollY, listScrollRef.current);
      listAnchorRef.current = { key: from, merchantId: id };
    }
    window.scrollTo(0, 0);
    setView({ type: "merchant", id, from, salesUserId });
  };

  const backFromMerchant = () => {
    if (view.type !== "merchant") return;
    const { from, salesUserId, salesOversight } = view;

    if (isListScrollKey(from)) {
      restoreScrollKeyRef.current = from;
    }

    if (from === "salesOversightDetail" && salesOversight) {
      setView({ type: "salesOversightDetail", ...salesOversight });
    } else if (from === "tigerTeamSales" && salesUserId) {
      setView({ type: "tigerTeamSales", salesUserId });
    } else if (from === "leaderTeamSales" && salesUserId) {
      setView({ type: "leaderTeamSales", salesUserId });
    } else if (from === "admin") {
      setView({ type: "dashboard" });
    } else if (from === "alerts") {
      setView({ type: "alerts" });
    } else {
      setView({ type: from });
    }
  };

  if (view.type === "userCenter") {
    return <UserCenterPage onBack={() => setView({ type: "dashboard" })} />;
  }

  if (view.type === "tigerTeamSales") {
    return (
      <TigerTeamSalesPage
        salesUserId={view.salesUserId}
        onBack={() => setView({ type: "tigerTeam" })}
        onOpenMerchant={(id) => openMerchant(id, "tigerTeamSales", view.salesUserId)}
      />
    );
  }

  if (view.type === "leaderTeamSales") {
    return (
      <TigerTeamSalesPage
        salesUserId={view.salesUserId}
        apiPathPrefix="/leader/team"
        scopeLabel="我的團隊"
        backLabel="返回我的團隊"
        onBack={() => setView({ type: "leaderTeam" })}
        onOpenMerchant={(id) => openMerchant(id, "leaderTeamSales", view.salesUserId)}
      />
    );
  }

  if (view.type === "leaderTeam" && user.role === "leader") {
    return (
      <TigerTeamPage
        title="我的團隊"
        apiPath="/leader/team"
        emptyHint="暫無歸屬銷售，請聯繫管理員在後臺為您配置團隊成員。"
        onBack={() => setView({ type: "dashboard" })}
        onOpenSales={(salesUserId) => setView({ type: "leaderTeamSales", salesUserId })}
      />
    );
  }

  if (view.type === "tigerTeam" && user.role === "admin") {
    return (
      <TigerTeamPage
        onBack={() => setView({ type: "dashboard" })}
        onOpenSales={(salesUserId) => setView({ type: "tigerTeamSales", salesUserId })}
      />
    );
  }

  if (view.type === "salesOversightDetail") {
    return (
      <SalesOversightDetailPage
        salesUserId={view.salesUserId}
        salesName={view.salesName}
        periodFilter={view.periodFilter}
        onBack={() => setView({ type: "alerts", adminTab: "sales" })}
        onOpenMerchant={(id) =>
          openMerchant(id, "salesOversightDetail", {
            salesUserId: view.salesUserId,
            salesName: view.salesName,
            periodFilter: view.periodFilter,
          })
        }
        onOpenAdmin={openAdmin}
        onOpenUserCenter={openUserCenter}
      />
    );
  }

  if (view.type === "admin" && user.role === "admin") {
    return <AdminPage onBack={() => setView({ type: "dashboard" })} />;
  }

  const showAlerts =
    view.type === "alerts" || (view.type === "merchant" && view.from === "alerts");
  const showMerchants =
    view.type === "merchants" || (view.type === "merchant" && view.from === "merchants");
  const showCardFailures =
    view.type === "cardFailures" || (view.type === "merchant" && view.from === "cardFailures");

  return (
    <>
      {showAlerts ? (
        <div hidden={view.type !== "alerts"}>
          <AlertsPage
            onBack={() => setView({ type: "dashboard" })}
            onOpenMerchant={(id) => openMerchant(id, "alerts")}
            onOpenSalesOversight={(ctx) => {
              window.scrollTo(0, 0);
              setView({ type: "salesOversightDetail", ...ctx });
            }}
            initialAdminView={view.type === "alerts" ? view.adminTab : undefined}
            onOpenAdmin={openAdmin}
            onOpenUserCenter={openUserCenter}
          />
        </div>
      ) : null}

      {showMerchants ? (
        <div hidden={view.type !== "merchants"}>
          <MerchantsPage
            initialViewSort={view.type === "merchants" ? view.viewSort : undefined}
            onBack={() => setView({ type: "dashboard" })}
            onOpenMerchant={(id) => openMerchant(id, "merchants")}
            onOpenAdmin={openAdmin}
            onOpenUserCenter={openUserCenter}
          />
        </div>
      ) : null}

      {showCardFailures ? (
        <div hidden={view.type !== "cardFailures"}>
          <CardFailuresPage
            onBack={() => setView({ type: "dashboard" })}
            onOpenMerchant={(id) => openMerchant(id, "cardFailures")}
            onOpenAdmin={openAdmin}
            onOpenUserCenter={openUserCenter}
          />
        </div>
      ) : null}

      {view.type === "merchant" ? (
        <MerchantPage merchantId={view.id} onBack={backFromMerchant} />
      ) : null}

      {view.type === "insightSummary" ? (
        <SalesInsightSummaryPage
          onBack={() => setView({ type: "dashboard" })}
          onOpenMerchants={openMerchants}
          onOpenAlerts={() => setView({ type: "alerts" })}
          onOpenAdmin={openAdmin}
          onOpenUserCenter={openUserCenter}
        />
      ) : null}

      {view.type === "dashboard" ? (
        <DashboardPage
          onOpenAlerts={() => setView({ type: "alerts" })}
          onOpenMerchants={openMerchants}
          onOpenCardFailures={() => setView({ type: "cardFailures" })}
          onOpenInsightSummary={
            user.role === "sales" ? () => setView({ type: "insightSummary" }) : undefined
          }
          onOpenAdmin={openAdmin}
          onOpenTigerTeam={openTigerTeam}
          onOpenLeaderTeam={openLeaderTeam}
          onOpenUserCenter={openUserCenter}
        />
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
