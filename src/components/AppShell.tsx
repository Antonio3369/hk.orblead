import type { ReactNode } from "react";
import { NeoButton } from "@/components/NeoButton";
import { SiteLegalFooter } from "@/components/SiteLegalFooter";

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}

export function AppShell({
  title,
  subtitle,
  children,
  actions,
  onBack,
  backLabel = "返回",
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="shell-header">
        <div className="shell-header-inner">
          <div className="shell-brand">
            {onBack ? (
              <NeoButton size="sm" className="shell-back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                {backLabel}
              </NeoButton>
            ) : (
              <div className="brand-mark" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="M7 16l3-4 3 2 5-7" />
                </svg>
              </div>
            )}
            <div className="shell-titles">
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          {actions}
        </div>
      </header>
      <main className="shell-main">{children}</main>
      <SiteLegalFooter className="site-legal-footer--shell" />
    </div>
  );
}
