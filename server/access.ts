import type { UserRole } from "./auth.js";
import { leaderCanAccessSales } from "./leaderTeam.js";

/** 查看商戶（管理員全部；主管含團隊；銷售僅本人） */
export function canReadMerchant(
  role: UserRole,
  userId: number,
  merchantSalesUserId: number | null
): boolean {
  if (role === "admin") return true;
  if (merchantSalesUserId === userId) return true;
  if (role === "leader" && merchantSalesUserId != null) {
    return leaderCanAccessSales(userId, merchantSalesUserId);
  }
  return false;
}

/** 填寫跟進等寫操作：管理員可操作全部；銷售僅本人名下商戶（主管不可代團隊提交） */
export function canWriteMerchant(
  role: UserRole,
  userId: number,
  merchantSalesUserId: number | null
): boolean {
  if (role === "admin") {
    return true;
  }
  return merchantSalesUserId === userId;
}
