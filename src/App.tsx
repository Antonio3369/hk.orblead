import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { DevThemeProvider } from "@/context/DevThemeContext";
import type { NavKey } from "@/config/navigation";
import { AdminPage } from "@/pages/AdminPage";
import { AlertsPage } from "@/pages/AlertsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { MerchantPage } from "@/pages/MerchantPage";
import { MerchantsPage } from "@/pages/MerchantsPage";
import { CardFailuresPage } from "@/pages/CardFailuresPage";
import { MastercardRankPage } from "@/pages/MastercardRankPage";
import { OverseasCardPage } from "@/pages/OverseasCardPage";
import { LeaderTeamPage } from "@/pages/LeaderTeamPage";
import { TigerTeamPage } from "@/pages/TigerTeamPage";
import { TigerTeamSalesPage } from "@/pages/TigerTeamSalesPage";
import { SalesOversightDetailPage, type SalesOversightContext } from "@/pages/SalesOversightDetailPage";
import { UserCenterPage } from "@/pages/UserCenterPage";
import { PageLoader } from "@/components/PageLoader";
import type { MerchantListSortKey } from "@/api/client";
import { getMainScrollTop, scrollMainTo, scrollMainToTop } from "@/utils/mainScroll";
import { normalizeOpenMerchantsParams, type OpenMerchantsParams } from "@/utils/openMerchants";
import type { SalesFilter } from "@/utils/salesFilter";

type MainView =
  | "dashboard"
  | "alerts"
  | "cardFailures"
  | "mastercardRank"
  | "overseasCards"
  | "admin"
  | "tigerTeam"
  | "leaderTeam"
  | "userCenter";

type MerchantsView = {
  type: "merchants";
  viewSort?: MerchantListSortKey;
  salesFilter?: SalesFilter;
};
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

type ListScrollKey = "alerts" | "merchants" | "cardFailures" | "mastercardRank" | "overseasCards";

function isListScrollKey(from: MerchantFrom): from is ListScrollKey {
  return (
    from === "alerts" ||
    from === "merchants" ||
    from === "cardFailures" ||
    from === "mastercardRank" ||
    from === "overseasCards"
  );
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

function activeNavFromView(view: View): NavKey | null {
  if (view.type === "merchant") {
    if (view.from === "alerts" || view.from === "salesOversightDetail") return "alerts";
    if (view.from === "merchants") return "merchants";
    if (view.from === "cardFailures") return "cardFailures";
    if (view.from === "mastercardRank") return "mastercardRank";
    if (view.from === "overseasCards") return "overseasCards";
    if (view.from === "tigerTeamSales") return "tigerTeam";
    if (view.from === "leaderTeamSales") return "leaderTeam";
    return "merchants";
  }
  if (view.type === "tigerTeamSales") return "tigerTeam";
  if (view.type === "leaderTeamSales") return "leaderTeam";
  if (view.type === "salesOversightDetail") return "alerts";
  if (
    view.type === "dashboard" ||
    view.type === "alerts" ||
    view.type === "merchants" ||
    view.type === "cardFailures" ||
    view.type === "mastercardRank" ||
    view.type === "overseasCards" ||
    view.type === "tigerTeam" ||
    view.type === "leaderTeam" ||
    view.type === "admin" ||
    view.type === "userCenter"
  ) {
    return view.type;
  }
  return null;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>({ type: "dashboard" });
  const [adminNavResetKey, setAdminNavResetKey] = useState(0);
  const listScrollRef = useRef<Partial<Record<ListScrollKey, number>>>({});
  const restoreScrollKeyRef = useRef<ListScrollKey | null>(null);
  const listAnchorRef = useRef<{ key: ListScrollKey; merchantId: number } | null>(null);
  const prevUserIdRef = useRef<number | null>(null);
  const lastMerchantsViewRef = useRef<Pick<MerchantsView, "viewSort" | "salesFilter">>({});

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
      scrollMainTo(y);
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

  const openMerchants = (params?: MerchantListSortKey | OpenMerchantsParams) => {
    scrollMainToTop();
    const next = { type: "merchants" as const, ...normalizeOpenMerchantsParams(params) };
    lastMerchantsViewRef.current = { viewSort: next.viewSort, salesFilter: next.salesFilter };
    setView(next);
  };

  const openMerchant = (
    id: number,
    from: MerchantFrom = "dashboard",
    ctx?: number | SalesOversightContext
  ) => {
    if (from === "salesOversightDetail") {
      const salesOversight = ctx as SalesOversightContext;
      scrollMainToTop();
      setView({ type: "merchant", id, from, salesOversight });
      return;
    }

    const salesUserId = typeof ctx === "number" ? ctx : undefined;
    if (from === "merchants" && view.type === "merchants") {
      lastMerchantsViewRef.current = { viewSort: view.viewSort, salesFilter: view.salesFilter };
    }
    if (isListScrollKey(from)) {
      writeListScroll(from, getMainScrollTop(), listScrollRef.current);
      listAnchorRef.current = { key: from, merchantId: id };
    }
    scrollMainToTop();
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
    } else if (from === "alerts") {
      setView({ type: "alerts" });
    } else if (from === "merchants") {
      setView({ type: "merchants", ...lastMerchantsViewRef.current });
    } else if (from === "admin") {
      setView({ type: "dashboard" });
    } else {
      setView({ type: from as MainView });
    }
  };

  const navigate = (key: NavKey) => {
    scrollMainToTop();
    if (key === "alerts") {
      setView({ type: "alerts" });
      return;
    }
    if (key === "merchants") {
      openMerchants();
      return;
    }
    if (key === "admin") {
      setAdminNavResetKey((k) => k + 1);
      setView({ type: "admin" });
      return;
    }
    setView({ type: key });
  };

  const showAlerts =
    view.type === "alerts" || (view.type === "merchant" && view.from === "alerts");
  const showMerchants =
    view.type === "merchants" || (view.type === "merchant" && view.from === "merchants");
  const showCardFailures =
    view.type === "cardFailures" || (view.type === "merchant" && view.from === "cardFailures");
  const showMastercardRank =
    view.type === "mastercardRank" || (view.type === "merchant" && view.from === "mastercardRank");
  const showOverseasCards =
    view.type === "overseasCards" || (view.type === "merchant" && view.from === "overseasCards");

  return (
    <AppLayout activeNav={activeNavFromView(view)} onNavigate={navigate}>
      {view.type === "userCenter" ? <UserCenterPage /> : null}

      {view.type === "tigerTeamSales" ? (
        <TigerTeamSalesPage
          salesUserId={view.salesUserId}
          onBack={() => setView({ type: "tigerTeam" })}
          onOpenMerchant={(id) => openMerchant(id, "tigerTeamSales", view.salesUserId)}
        />
      ) : null}

      {view.type === "leaderTeamSales" ? (
        <TigerTeamSalesPage
          salesUserId={view.salesUserId}
          apiPathPrefix="/leader/team"
          scopeLabel="我的團隊"
          backLabel="返回我的團隊"
          onBack={() => setView({ type: "leaderTeam" })}
          onOpenMerchant={(id) => openMerchant(id, "leaderTeamSales", view.salesUserId)}
        />
      ) : null}

      {view.type === "leaderTeam" && user.role === "leader" ? (
        <LeaderTeamPage
          onOpenSales={(salesUserId) => setView({ type: "leaderTeamSales", salesUserId })}
          onOpenMerchant={(id) => openMerchant(id, "leaderTeam")}
          onOpenMerchants={openMerchants}
        />
      ) : null}

      {view.type === "tigerTeam" && user.role === "admin" ? (
        <TigerTeamPage onOpenSales={(salesUserId) => setView({ type: "tigerTeamSales", salesUserId })} />
      ) : null}

      {view.type === "salesOversightDetail" ? (
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
        />
      ) : null}

      {view.type === "admin" && user.role === "admin" ? (
        <AdminPage navResetKey={adminNavResetKey} />
      ) : null}

      {showAlerts ? (
        <div hidden={view.type !== "alerts"}>
          <AlertsPage
            onOpenMerchant={(id) => openMerchant(id, "alerts")}
            onOpenSalesOversight={(ctx) => {
              scrollMainToTop();
              setView({ type: "salesOversightDetail", ...ctx });
            }}
            initialAdminView={view.type === "alerts" && "adminTab" in view ? view.adminTab : undefined}
          />
        </div>
      ) : null}

      {showMerchants ? (
        <div hidden={view.type !== "merchants"}>
          <MerchantsPage
            initialViewSort={view.type === "merchants" ? view.viewSort : undefined}
            initialSalesFilter={view.type === "merchants" ? view.salesFilter : undefined}
            onOpenMerchant={(id) => openMerchant(id, "merchants")}
          />
        </div>
      ) : null}

      {showCardFailures ? (
        <div hidden={view.type !== "cardFailures"}>
          <CardFailuresPage onOpenMerchant={(id) => openMerchant(id, "cardFailures")} />
        </div>
      ) : null}

      {showMastercardRank ? (
        <div hidden={view.type !== "mastercardRank"}>
          <MastercardRankPage onOpenMerchant={(id) => openMerchant(id, "mastercardRank")} />
        </div>
      ) : null}

      {showOverseasCards ? (
        <div hidden={view.type !== "overseasCards"}>
          <OverseasCardPage onOpenMerchant={(id) => openMerchant(id, "overseasCards")} />
        </div>
      ) : null}

      {view.type === "merchant" ? (
        <MerchantPage merchantId={view.id} onBack={backFromMerchant} />
      ) : null}

      {view.type === "dashboard" ? (
        <DashboardPage
          onOpenAlerts={() => setView({ type: "alerts" })}
          onOpenMerchants={openMerchants}
          onOpenMerchant={(id) => openMerchant(id, "dashboard")}
          onOpenTigerTeam={() => setView({ type: "tigerTeam" })}
          onOpenTigerTeamSales={(salesUserId) => setView({ type: "tigerTeamSales", salesUserId })}
        />
      ) : null}
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DevThemeProvider>
        <AppRoutes />
      </DevThemeProvider>
    </AuthProvider>
  );
}
