import type { WeeklyAlertDigest } from "@/api/client";

interface AlertDigestBannerProps {
  digest: WeeklyAlertDigest;
  onOpenAlerts: () => void;
  onOpenUnfollowed?: () => void;
}

export function AlertDigestBanner({ digest, onOpenAlerts, onOpenUnfollowed }: AlertDigestBannerProps) {
  const topLine =
    digest.topUnfollowedSales.length > 0
      ? digest.topUnfollowedSales.map((s) => `${s.salesName}（${s.unfollowed}）`).join(" · ")
      : "各銷售跟進正常";

  return (
    <section className="alert-digest-banner" aria-label="本週預警處理摘要">
      <div className="alert-digest-banner__main">
        <p className="alert-digest-banner__title">本週預警督辦</p>
        <p className="alert-digest-banner__stats">
          共 <strong>{digest.total}</strong> 條 · 已跟進{" "}
          <strong>{digest.followed}</strong>（{digest.followRatePercent}%）· 未跟進{" "}
          <button type="button" className="link-btn alert-digest-banner__link" onClick={onOpenUnfollowed ?? onOpenAlerts}>
            {digest.unfollowed}
          </button>
          {digest.pendingAdminRead > 0 ? (
            <>
              {" "}
              · 待閱 <strong>{digest.pendingAdminRead}</strong>
            </>
          ) : null}
        </p>
        <p className="alert-digest-banner__hint">最需關注：{topLine}</p>
      </div>
      <button type="button" className="btn btn-sm" onClick={onOpenAlerts}>
        進入督辦
      </button>
    </section>
  );
}
