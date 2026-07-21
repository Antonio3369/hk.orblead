/** 与 server/analytics.ts 保持一致：上月 < 100 HKD 或为负时，默认按 10 HKD 作底数 */
export const MIN_LAST_MONTH_AMOUNT_FOR_DAILY_COMPARE = 100;
export const DEFAULT_LAST_MONTH_BASELINE_HKD = 10;
export const MAX_DAILY_AVG_CHANGE_PERCENT = 999.9;

export function effectiveLastMonthAmountForDailyCompare(lastMonthAmount: number): number {
  if (lastMonthAmount < MIN_LAST_MONTH_AMOUNT_FOR_DAILY_COMPARE) {
    return DEFAULT_LAST_MONTH_BASELINE_HKD;
  }
  return lastMonthAmount;
}

export function calcDailyAvgChangePercent(
  mtdAmount: number,
  mtdDays: number,
  lastMonthAmount: number,
  lastMonthDays: number
): number | null {
  if (mtdDays <= 0 || lastMonthDays <= 0) return null;

  const baselineAmount = effectiveLastMonthAmountForDailyCompare(lastMonthAmount);
  const currentDailyAvg = mtdAmount / mtdDays;
  const lastMonthDailyAvg = baselineAmount / lastMonthDays;

  const raw = Math.round(((currentDailyAvg - lastMonthDailyAvg) / lastMonthDailyAvg) * 1000) / 10;
  if (!Number.isFinite(raw)) return null;

  return Math.max(
    -MAX_DAILY_AVG_CHANGE_PERCENT,
    Math.min(MAX_DAILY_AVG_CHANGE_PERCENT, raw)
  );
}

export function dailyAvgBaselineHint(lastMonthAmount: number): string | undefined {
  if (lastMonthAmount < MIN_LAST_MONTH_AMOUNT_FOR_DAILY_COMPARE) {
    return `上月交易額不足 ${MIN_LAST_MONTH_AMOUNT_FOR_DAILY_COMPARE} HKD（或為負）時，日均環比改以 ${DEFAULT_LAST_MONTH_BASELINE_HKD} HKD 為底數估算`;
  }
  return undefined;
}
