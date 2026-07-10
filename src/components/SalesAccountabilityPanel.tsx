import type { SalesAccountabilityRow } from "@/api/client";

interface SalesAccountabilityPanelProps {
  rows: SalesAccountabilityRow[];
  loading?: boolean;
  onViewSales: (salesUserId: number | null, salesName: string) => void;
}

export function SalesAccountabilityPanel({ rows, loading, onViewSales }: SalesAccountabilityPanelProps) {
  if (loading) {
    return <p className="muted accountability-loading">載入銷售督辦榜…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state accountability-empty">
        <p>暫無需督辦的銷售</p>
      </div>
    );
  }

  return (
    <div className="accountability-panel">
      <p className="accountability-intro">按未跟進數排序，優先催辦排在前的銷售。</p>
      <div className="table-wrap table-wrap--stack accountability-table-wrap">
        <table className="data-table accountability-table">
          <thead>
            <tr>
              <th>銷售</th>
              <th>未跟進</th>
              <th>最久未處理</th>
              <th>本週已跟進</th>
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.salesUserId ?? `unassigned-${row.salesName}`}>
                <td data-label="銷售">{row.salesName}</td>
                <td data-label="未跟進">
                  <span className={row.unfollowed > 0 ? "accountability-num accountability-num--warn" : ""}>
                    {row.unfollowed}
                  </span>
                </td>
                <td data-label="最久未處理">
                  {row.unfollowed > 0 && row.maxStaleDays > 0 ? `${row.maxStaleDays} 天` : "—"}
                </td>
                <td data-label="本週已跟進">{row.followedThisWeek}</td>
                <td data-label="操作">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onViewSales(row.salesUserId, row.salesName)}
                  >
                    查看未跟進
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
