import { THEME_TOKEN_GROUPS, presetForMode } from "@/config/themeTokens";
import { useDevTheme } from "@/context/DevThemeContext";

function ThemePreview() {
  return (
    <div className="dev-theme-preview">
      <div className="dev-theme-preview-card panel">
        <h3 className="dev-theme-preview-title">預覽</h3>
        <p className="panel-desc panel-desc-tight">調整左側色值後，全站即時生效（僅管理員可見）。</p>
        <div className="dev-theme-preview-row">
          <button type="button" className="btn btn-primary btn-sm">
            主按鈕
          </button>
          <button type="button" className="btn btn-sm btn-ghost">
            次要
          </button>
          <span className="change-pill up">↑ +12.5%</span>
          <span className="change-pill down">↓ -8.2%</span>
        </div>
        <div className="dev-theme-preview-row">
          <span className="dashboard-stat-card dev-theme-stat">
            <span className="dashboard-stat-label">示例統計</span>
            <span className="dashboard-stat-value">128</span>
          </span>
          <span className="dev-theme-badge dev-theme-badge--warn">警告</span>
          <span className="dev-theme-badge dev-theme-badge--danger">危險</span>
        </div>
      </div>
    </div>
  );
}

export function DeveloperViewPanel() {
  const { mode, effective, overrides, setMode, setToken, resetAll, resetToken } = useDevTheme();

  return (
    <>
      <section className="panel dev-theme-toolbar">
        <div className="dev-theme-mode-toggle">
          <span className="dev-theme-mode-label">外觀模式</span>
          <button
            type="button"
            className={`btn btn-sm ${mode === "light" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setMode("light")}
          >
            淺色
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === "dark" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setMode("dark")}
          >
            深色
          </button>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={resetAll}>
          恢復預設
        </button>
      </section>

      <ThemePreview />

      <div className="dev-theme-groups">
        {THEME_TOKEN_GROUPS.map((group) => (
          <section key={group.id} className="panel dev-theme-group">
            <h2 className="panel-title">{group.title}</h2>
            <ul className="dev-theme-token-list">
              {group.tokens.map((token) => {
                const value = effective[token.var] ?? "";
                const preset = presetForMode(mode)[token.var] ?? "";
                const customized = overrides[token.var] != null && overrides[token.var] !== preset;
                return (
                  <li key={token.var} className="dev-theme-token-item">
                    <div className="dev-theme-token-meta">
                      <span className="dev-theme-token-label">{token.label}</span>
                      <code className="dev-theme-token-var">{token.var}</code>
                    </div>
                    <div className="dev-theme-token-controls">
                      <input
                        type="color"
                        value={toColorInput(value)}
                        onChange={(e) => setToken(token.var, e.target.value)}
                        aria-label={`${token.label} 色值`}
                      />
                      <input
                        type="text"
                        className="dev-theme-token-input"
                        value={value}
                        onChange={(e) => setToken(token.var, e.target.value.trim())}
                        spellCheck={false}
                      />
                      {customized ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => resetToken(token.var)}
                        >
                          還原
                        </button>
                      ) : null}
                    </div>
                    <span
                      className="dev-theme-swatch"
                      style={{ background: value, borderColor: "var(--border)" }}
                      aria-hidden
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function toColorInput(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#3b82f6";
}
