import type { MerchantListSortKey } from "@/api/client";
import type { SalesFilter } from "@/utils/salesFilter";

export interface OpenMerchantsParams {
  viewSort?: MerchantListSortKey;
  salesFilter?: SalesFilter;
}

export function normalizeOpenMerchantsParams(
  input?: MerchantListSortKey | OpenMerchantsParams
): OpenMerchantsParams {
  if (input == null) return {};
  if (typeof input === "string") return { viewSort: input };
  return input;
}
