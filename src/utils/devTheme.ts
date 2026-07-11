import {
  ALL_THEME_TOKEN_VARS,
  LIGHT_THEME_DEFAULTS,
  presetForMode,
  type ThemeMode,
} from "@/config/themeTokens";

const STORAGE_KEY = "orblead-dev-theme-v1";

export interface DevThemeState {
  mode: ThemeMode;
  overrides: Record<string, string>;
}

export function readDevThemeState(): DevThemeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DevThemeState;
    if (parsed.mode !== "light" && parsed.mode !== "dark") return null;
    if (!parsed.overrides || typeof parsed.overrides !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDevThemeState(state: DevThemeState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearDevThemeState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function mergeTheme(mode: ThemeMode, overrides: Record<string, string>): Record<string, string> {
  const base = presetForMode(mode);
  const merged = { ...base };
  for (const key of ALL_THEME_TOKEN_VARS) {
    if (overrides[key]) merged[key] = overrides[key];
  }
  return merged;
}

export function applyThemeToDocument(vars: Record<string, string>, mode: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.theme = mode;
  for (const key of ALL_THEME_TOKEN_VARS) {
    const value = vars[key] ?? LIGHT_THEME_DEFAULTS[key];
    if (value) root.style.setProperty(key, value);
  }
  document.body.style.background =
    mode === "dark"
      ? "linear-gradient(180deg, #0f172a 0%, #1e293b 45%, #0f172a 100%)"
      : "";
  document.body.style.color = vars["--text"] ?? "";
}

export function resetThemeDocument(): void {
  const root = document.documentElement;
  delete root.dataset.theme;
  for (const key of ALL_THEME_TOKEN_VARS) {
    root.style.removeProperty(key);
  }
  document.body.style.background = "";
  document.body.style.color = "";
}

export function initDevThemeFromStorage(): DevThemeState {
  const saved = readDevThemeState();
  return saved ?? { mode: "light", overrides: {} };
}
