import type { UserRole } from "@/api/client";
import type { HomeEntryIconKind } from "@/components/HomeEntryIcon";

export type NavKey =
  | "dashboard"
  | "alerts"
  | "merchants"
  | "cardFailures"
  | "mastercardRank"
  | "overseasCards"
  | "tigerTeam"
  | "leaderTeam"
  | "admin"
  | "userCenter";

export interface NavItem {
  key: NavKey;
  label: string;
  icon: HomeEntryIconKind | "dashboard" | "admin" | "settings";
  section: "main" | "footer";
  roles?: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "工作台", icon: "dashboard", section: "main" },
  { key: "tigerTeam", label: "飛虎隊", icon: "tiger", section: "main", roles: ["admin"] },
  { key: "leaderTeam", label: "我的團隊", icon: "team", section: "main", roles: ["leader"] },
  { key: "merchants", label: "商戶列表", icon: "merchants", section: "main" },
  { key: "alerts", label: "交易預警", icon: "alerts", section: "main" },
  { key: "cardFailures", label: "交易失敗", icon: "failures", section: "main" },
  { key: "overseasCards", label: "境外卡交易", icon: "overseasCard", section: "main" },
  { key: "mastercardRank", label: "萬事達排名", icon: "mastercard", section: "main" },
  { key: "admin", label: "後臺管理", icon: "admin", section: "footer", roles: ["admin"] },
  { key: "userCenter", label: "用戶中心", icon: "settings", section: "footer" },
];

export function navItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

export function merchantsNavLabel(role: UserRole): string {
  if (role === "admin") return "全部商戶";
  if (role === "leader") return "我的與團隊商戶";
  return "我的商戶";
}

/** 侧栏项展示文案（商户项按角色差异化） */
export function navItemLabel(item: NavItem, role: UserRole): string {
  if (item.key === "merchants") return merchantsNavLabel(role);
  return item.label;
}

/** Leader 工作台：个人 scope 说明（用于 title / 提示） */
export const LEADER_PERSONAL_SCOPE_HINT = "僅統計本人歸屬商戶；團隊合計見「我的團隊」";

