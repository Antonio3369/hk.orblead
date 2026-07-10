import { db } from "./db.js";

const SETTING_KEY = "daily_decline_threshold_percent";
const DEFAULT_THRESHOLD = 10;

export function initInsightSettings(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS insight_settings (
      key TEXT PRIMARY KEY,
      value REAL NOT NULL
    );
  `);
  const row = db.prepare(`SELECT value FROM insight_settings WHERE key = ?`).get(SETTING_KEY) as
    | { value: number }
    | undefined;
  if (!row) {
    db.prepare(`INSERT INTO insight_settings (key, value) VALUES (?, ?)`).run(
      SETTING_KEY,
      DEFAULT_THRESHOLD
    );
  }
}

export function getDailyDeclineThreshold(): number {
  initInsightSettings();
  const row = db.prepare(`SELECT value FROM insight_settings WHERE key = ?`).get(SETTING_KEY) as
    | { value: number }
    | undefined;
  return row?.value ?? DEFAULT_THRESHOLD;
}

export function setDailyDeclineThreshold(percent: number): number {
  initInsightSettings();
  if (!Number.isFinite(percent) || percent < 1 || percent > 99) {
    throw new Error("閾值須為 1–99 之間的數字");
  }
  db.prepare(
    `INSERT INTO insight_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(SETTING_KEY, percent);
  return percent;
}
