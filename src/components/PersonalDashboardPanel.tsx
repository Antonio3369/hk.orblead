import { useMemo } from "react";
import { type MerchantListSortKey, type PersonalDashboardCharts, type SalesHomeInsightSnapshot } from "@/api/client";
import { DashboardChartsCore } from "@/components/DashboardChartsCore";
import type { OpenMerchantsParams } from "@/utils/openMerchants";

interface PersonalDashboardPanelProps {
  charts: PersonalDashboardCharts;
  homeInsight?: SalesHomeInsightSnapshot;
  isLeader?: boolean;
  onOpenMerchants: (params?: MerchantListSortKey | OpenMerchantsParams) => void;
}

export function PersonalDashboardPanel({
  charts,
  homeInsight,
  isLeader = false,
  onOpenMerchants,
}: PersonalDashboardPanelProps) {
  const insightJumps = useMemo(() => {
    if (!homeInsight) return undefined;
    const { insightSummary } = homeInsight;
    return [
      { sort: "newSilent" as const, label: "新沉默", count: insightSummary.newSilentCount, tone: "rose" as const },
      { sort: "declining" as const, label: "下跌中", count: insightSummary.decliningCount, tone: "amber" as const },
      { sort: "rising" as const, label: "上漲", count: insightSummary.risingCount, tone: "green" as const },
      {
        sort: "unreadAlerts" as const,
        label: "預警跟進",
        count: homeInsight.unreadAlertMerchantCount,
        tone: "blue" as const,
      },
    ];
  }, [homeInsight]);

  return (
    <DashboardChartsCore
      charts={charts}
      monthlyTrendSubtitle={isLeader ? "近三個自然月 · 本人商戶" : "近三個自然月 · 我的商戶"}
      merchantInsightFootnote={
        isLeader && homeInsight
          ? `本人歸屬 ${homeInsight.insightSummary.assignedMerchantCount} 家 · 團隊分布見「我的團隊」`
          : undefined
      }
      insightJumps={insightJumps}
      onInsightJump={(sort) =>
        onOpenMerchants(isLeader ? { viewSort: sort, salesFilter: "self" } : sort)
      }
    />
  );
}
