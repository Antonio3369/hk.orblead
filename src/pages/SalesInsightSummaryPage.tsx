import { AppShell } from "@/components/AppShell";
import { PageLoader } from "@/components/PageLoader";
import { SalesHomeInsightPanel } from "@/components/SalesHomeInsightPanel";
import { useAuth } from "@/context/AuthContext";
import { useSalesHomeInsight } from "@/hooks/useSalesHomeInsight";
import type { MerchantListSortKey } from "@/api/client";
import { BRAND } from "@/config/branding";

interface SalesInsightSummaryPageProps {
  onOpenMerchants: (viewSort?: MerchantListSortKey) => void;
  onOpenAlerts: () => void;
}

export function SalesInsightSummaryPage({
  onOpenMerchants,
  onOpenAlerts,
}: SalesInsightSummaryPageProps) {
  const { user } = useAuth();
  const { loading, homeInsight, unreadAlerts } = useSalesHomeInsight(true);
  const scopeLabel = user?.role === "leader" ? "我的商戶與團隊" : "我的商戶";

  return (
    <AppShell
      title="摘要"
      subtitle={`${BRAND.companyName} · ${scopeLabel}`}
    >
      {loading ? (
        <PageLoader block />
      ) : homeInsight ? (
        <SalesHomeInsightPanel
          snapshot={homeInsight}
          unreadAlerts={unreadAlerts}
          scopeLabel={scopeLabel}
          onOpenMerchants={onOpenMerchants}
          onOpenAlerts={onOpenAlerts}
        />
      ) : (
        <p className="muted">暫無摘要數據，請稍後再試或聯繫管理員。</p>
      )}
    </AppShell>
  );
}
