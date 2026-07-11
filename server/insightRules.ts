import { db } from "./db.js";

const DAILY_DECLINE_KEY = "daily_decline_threshold_percent";
const DEFAULT_DAILY_DECLINE_THRESHOLD = 10;

const MASTERCARD_WARN_KEY = "mastercard_lifetime_highlight_hkd";
export const DEFAULT_MASTERCARD_LIFETIME_WARN_HKD = 1_300_000;

const MASTERCARD_ALERT_KEY = "mastercard_lifetime_alert_hkd";
export const DEFAULT_MASTERCARD_LIFETIME_ALERT_HKD = 1_600_000;

function ensureSetting(key: string, defaultValue: number): void {
  const row = db.prepare(`SELECT value FROM insight_settings WHERE key = ?`).get(key) as
    | { value: number }
    | undefined;
  if (!row) {
    db.prepare(`INSERT INTO insight_settings (key, value) VALUES (?, ?)`).run(key, defaultValue);
  }
}

export function initInsightSettings(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS insight_settings (
      key TEXT PRIMARY KEY,
      value REAL NOT NULL
    );
  `);
  ensureSetting(DAILY_DECLINE_KEY, DEFAULT_DAILY_DECLINE_THRESHOLD);
  ensureSetting(MASTERCARD_WARN_KEY, DEFAULT_MASTERCARD_LIFETIME_WARN_HKD);
  ensureSetting(MASTERCARD_ALERT_KEY, DEFAULT_MASTERCARD_LIFETIME_ALERT_HKD);
}

export function getDailyDeclineThreshold(): number {
  initInsightSettings();
  const row = db.prepare(`SELECT value FROM insight_settings WHERE key = ?`).get(DAILY_DECLINE_KEY) as
    | { value: number }
    | undefined;
  return row?.value ?? DEFAULT_DAILY_DECLINE_THRESHOLD;
}

export function setDailyDeclineThreshold(percent: number): number {
  initInsightSettings();
  if (!Number.isFinite(percent) || percent < 1 || percent > 99) {
    throw new Error("閾值須為 1–99 之間的數字");
  }
  db.prepare(
    `INSERT INTO insight_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(DAILY_DECLINE_KEY, percent);
  return percent;
}

export function getMastercardLifetimeWarnHkd(): number {
  initInsightSettings();
  const row = db.prepare(`SELECT value FROM insight_settings WHERE key = ?`).get(MASTERCARD_WARN_KEY) as
    | { value: number }
    | undefined;
  return row?.value ?? DEFAULT_MASTERCARD_LIFETIME_WARN_HKD;
}

export function getMastercardLifetimeAlertHkd(): number {
  initInsightSettings();
  const row = db.prepare(`SELECT value FROM insight_settings WHERE key = ?`).get(MASTERCARD_ALERT_KEY) as
    | { value: number }
    | undefined;
  return row?.value ?? DEFAULT_MASTERCARD_LIFETIME_ALERT_HKD;
}

/** @deprecated use getMastercardLifetimeWarnHkd */
export function getMastercardLifetimeHighlightHkd(): number {
  return getMastercardLifetimeWarnHkd();
}

function validateMastercardHkd(hkd: number): number {
  if (!Number.isFinite(hkd) || hkd < 10_000 || hkd > 99_999_999) {
    throw new Error("閾值須為 1 萬至 9,999 萬港幣之間");
  }
  return Math.round(hkd);
}

export function setMastercardLifetimeWarnHkd(hkd: number): number {
  initInsightSettings();
  const rounded = validateMastercardHkd(hkd);
  const alert = getMastercardLifetimeAlertHkd();
  if (rounded >= alert) {
    throw new Error("標黃閾值須低於標紅閾值");
  }
  db.prepare(
    `INSERT INTO insight_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(MASTERCARD_WARN_KEY, rounded);
  return rounded;
}

export function setMastercardLifetimeAlertHkd(hkd: number): number {
  initInsightSettings();
  const rounded = validateMastercardHkd(hkd);
  const warn = getMastercardLifetimeWarnHkd();
  if (rounded <= warn) {
    throw new Error("標紅閾值須高於標黃閾值");
  }
  db.prepare(
    `INSERT INTO insight_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(MASTERCARD_ALERT_KEY, rounded);
  return rounded;
}

/** @deprecated use setMastercardLifetimeWarnHkd */
export function setMastercardLifetimeHighlightHkd(hkd: number): number {
  return setMastercardLifetimeWarnHkd(hkd);
}
