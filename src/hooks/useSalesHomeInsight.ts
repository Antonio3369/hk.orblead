import { useEffect, useState } from "react";
import { api, type MerchantSummary, type SalesHomeInsightSnapshot } from "@/api/client";
import { buildHomeInsightFromMerchants, normalizeMerchantSummary } from "@/utils/merchantInsightView";

export function useSalesHomeInsight(enabled: boolean) {
  const [loading, setLoading] = useState(enabled);
  const [homeInsight, setHomeInsight] = useState<SalesHomeInsightSnapshot | undefined>();
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<{ homeInsight?: SalesHomeInsightSnapshot; unreadAlerts: number }>("/stats/overview")
      .then(async (data) => {
        setUnreadAlerts(data.unreadAlerts);
        let insight = data.homeInsight;
        if (!insight) {
          try {
            const merchantsRes = await api<{ merchants: MerchantSummary[]; mtdLabel: string }>(
              "/merchants"
            );
            insight = buildHomeInsightFromMerchants(
              merchantsRes.merchants.map(normalizeMerchantSummary),
              merchantsRes.mtdLabel
            );
          } catch {
            // 保留无摘要状态
          }
        }
        setHomeInsight(insight);
      })
      .finally(() => setLoading(false));
  }, [enabled]);

  return { loading, homeInsight, unreadAlerts };
}
