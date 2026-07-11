export type ThemeMode = "light" | "dark";

export interface ThemeTokenDef {
  var: string;
  label: string;
}

export interface ThemeTokenGroup {
  id: string;
  title: string;
  tokens: ThemeTokenDef[];
}

/** 主頁面 UI 使用的 CSS 變量（:root） */
export const THEME_TOKEN_GROUPS: ThemeTokenGroup[] = [
  {
    id: "base",
    title: "背景與表面",
    tokens: [
      { var: "--bg", label: "頁面背景" },
      { var: "--bg-subtle", label: "淺背景" },
      { var: "--surface", label: "卡片/面板" },
      { var: "--surface-hover", label: "懸停表面" },
      { var: "--border", label: "邊框" },
      { var: "--border-light", label: "淺邊框" },
    ],
  },
  {
    id: "text",
    title: "文字",
    tokens: [
      { var: "--text", label: "主文字" },
      { var: "--text-primary", label: "標題文字" },
      { var: "--text-secondary", label: "次要文字" },
      { var: "--text-muted", label: "輔助文字" },
    ],
  },
  {
    id: "brand",
    title: "主色與強調",
    tokens: [
      { var: "--primary", label: "主色" },
      { var: "--primary-hover", label: "主色懸停" },
      { var: "--primary-soft", label: "主色浅底" },
      { var: "--primary-muted", label: "主色描邊/浅块" },
      { var: "--accent", label: "強調色" },
    ],
  },
  {
    id: "semantic",
    title: "語義色",
    tokens: [
      { var: "--success", label: "成功" },
      { var: "--success-soft", label: "成功浅底" },
      { var: "--danger", label: "危險/下跌" },
      { var: "--danger-soft", label: "危險浅底" },
      { var: "--warn", label: "警告" },
      { var: "--warn-soft", label: "警告浅底" },
    ],
  },
];

export const ALL_THEME_TOKEN_VARS = THEME_TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => t.var));

export const LIGHT_THEME_DEFAULTS: Record<string, string> = {
  "--bg": "#e9edf3",
  "--bg-subtle": "#f4f6f9",
  "--surface": "#ffffff",
  "--surface-hover": "#f8fafc",
  "--border": "#e2e8f0",
  "--border-light": "#eef2f7",
  "--text": "#111827",
  "--text-primary": "#111827",
  "--text-secondary": "#64748b",
  "--text-muted": "#94a3b8",
  "--primary": "#3b82f6",
  "--primary-hover": "#2563eb",
  "--primary-soft": "#eff6ff",
  "--primary-muted": "#dbeafe",
  "--accent": "#3b82f6",
  "--success": "#059669",
  "--success-soft": "#ecfdf5",
  "--danger": "#dc2626",
  "--danger-soft": "#fef2f2",
  "--warn": "#d97706",
  "--warn-soft": "#fffbeb",
};

export const DARK_THEME_DEFAULTS: Record<string, string> = {
  "--bg": "#0f172a",
  "--bg-subtle": "#1e293b",
  "--surface": "#1e293b",
  "--surface-hover": "#334155",
  "--border": "#334155",
  "--border-light": "#475569",
  "--text": "#f1f5f9",
  "--text-primary": "#f8fafc",
  "--text-secondary": "#cbd5e1",
  "--text-muted": "#94a3b8",
  "--primary": "#60a5fa",
  "--primary-hover": "#93c5fd",
  "--primary-soft": "#1e3a5f",
  "--primary-muted": "#1e40af",
  "--accent": "#60a5fa",
  "--success": "#34d399",
  "--success-soft": "#064e3b",
  "--danger": "#f87171",
  "--danger-soft": "#450a0a",
  "--warn": "#fbbf24",
  "--warn-soft": "#451a03",
};

export function presetForMode(mode: ThemeMode): Record<string, string> {
  return mode === "dark" ? { ...DARK_THEME_DEFAULTS } : { ...LIGHT_THEME_DEFAULTS };
}
