import { useMemo } from "react";
import { type LeaderDashboardCharts, type MerchantListSortKey } from "@/api/client";
import { HorizontalRankBoard, type RankRow } from "@/components/dashboardChartParts";

interface LeaderTeamRankingsPanelProps {
  charts: LeaderDashboardCharts;
  onOpenMerchants: (viewSort?: MerchantListSortKey) => void;
  onOpenMerchant: (id: number) => void;
  onOpenLeaderTeamSales: (salesUserId: number) => void;
}

export function LeaderTeamRankingsPanel({
  charts,
  onOpenMerchants,
  onOpenMerchant,
  onOpenLeaderTeamSales,
}: LeaderTeamRankingsPanelProps) {
  const salesRows: RankRow[] = useMemo(
    () =>
      charts.salesRanking.sales.map((s) => ({
        rank: s.rank,
        id: s.id,
        title: s.displayName,
        amount: s.lastMonthAmount,
        sharePercent: s.sharePercent,
        meta: `活躍 ${s.activeMerchantCount} / 歸屬 ${s.assignedMerchantCount} 家`,
      })),
    [charts.salesRanking.sales]
  );

  const merchantRows: RankRow[] = useMemo(
    () =>
      charts.merchantBoxOffice.merchants.map((m) => ({
        rank: m.rank,
        id: m.id,
        title: m.name,
        subtitle: m.salesName ? `歸屬：${m.salesName}` : undefined,
        amount: m.lastMonthAmount,
        sharePercent: m.sharePercent,
      })),
    [charts.merchantBoxOffice.merchants]
  );

  const maxSalesShare = salesRows[0]?.sharePercent ?? 1;
  const maxMerchantShare = merchantRows[0]?.sharePercent ?? 1;

  return (
    <div className="admin-rank-duo">
      <HorizontalRankBoard
        title={`我的團隊 · ${charts.salesRanking.rankMonth}業績排名`}
        rows={salesRows}
        maxShare={maxSalesShare}
        onRowClick={onOpenLeaderTeamSales}
        emptyHint="暫無團隊成員，請聯繫管理員在後臺配置。"
      />
      <HorizontalRankBoard
        title="商戶票房榜 · Top 20"
        rows={merchantRows}
        maxShare={maxMerchantShare}
        onRowClick={onOpenMerchant}
        previewLimit={5}
        footerAction={{ label: "查看全部商戶 →", onClick: () => onOpenMerchants("lastMonthAmount") }}
        emptyHint="團隊範圍內暫無上月交易數據。"
      />
    </div>
  );
}
