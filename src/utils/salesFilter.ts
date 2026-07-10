/** all=全部；self=主管直屬；number=指定銷售 user id；unassigned=待分配 */
export type SalesFilter = "all" | "self" | "unassigned" | number;

export function parseSalesFilter(value: string): SalesFilter {
  if (value === "all") return "all";
  if (value === "self") return "self";
  if (value === "unassigned") return "unassigned";
  const id = Number(value);
  return Number.isFinite(id) ? id : "all";
}

export function salesFilterValue(filter: SalesFilter): string {
  if (filter === "all") return "all";
  if (filter === "self") return "self";
  if (filter === "unassigned") return "unassigned";
  return String(filter);
}
