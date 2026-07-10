import type { TigerTeamSalesRow } from "@/api/client";
import { parseSalesFilter, salesFilterValue, type SalesFilter } from "@/utils/salesFilter";

interface SalesFilterSelectProps {
  value: SalesFilter;
  onChange: (value: SalesFilter) => void;
  ariaLabel: string;
  leaderDisplayName?: string;
  leaderTeam?: TigerTeamSalesRow[];
  adminSalesOptions?: Array<{ id: number | "unassigned"; name: string }>;
  showLeaderOptions?: boolean;
  showAdminOptions?: boolean;
}

export function SalesFilterSelect({
  value,
  onChange,
  ariaLabel,
  leaderDisplayName,
  leaderTeam = [],
  adminSalesOptions = [],
  showLeaderOptions = false,
  showAdminOptions = false,
}: SalesFilterSelectProps) {
  return (
    <label className="merchant-filter-label">
      <span className="merchant-filter-label-text">所屬銷售</span>
      <div className="merchant-filter-wrap">
        <select
          className="merchant-filter-select"
          value={salesFilterValue(value)}
          onChange={(e) => onChange(parseSalesFilter(e.target.value))}
          aria-label={ariaLabel}
        >
          <option value="all">全部</option>
          {showLeaderOptions && leaderDisplayName ? (
            <option value="self">直屬商戶（{leaderDisplayName}）</option>
          ) : null}
          {showLeaderOptions
            ? leaderTeam.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.displayName}
                </option>
              ))
            : null}
          {showAdminOptions
            ? adminSalesOptions.map((opt) => (
                <option
                  key={opt.id === "unassigned" ? "unassigned" : opt.id}
                  value={opt.id === "unassigned" ? "unassigned" : String(opt.id)}
                >
                  {opt.name}
                </option>
              ))
            : null}
        </select>
        <svg
          className="merchant-filter-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </label>
  );
}
