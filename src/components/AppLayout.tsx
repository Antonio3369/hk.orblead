import { useEffect, useState, type ReactNode } from "react";
import { SidebarNav } from "@/components/SidebarNav";
import { SiteLegalFooter } from "@/components/SiteLegalFooter";
import type { NavKey } from "@/config/navigation";
import { navItemsForRole } from "@/config/navigation";
import { useAuth } from "@/context/AuthContext";

interface AppLayoutProps {
  activeNav: NavKey | null;
  onNavigate: (key: NavKey) => void;
  children: ReactNode;
}

export function AppLayout({ activeNav, onNavigate, children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.classList.add("sidebar-open");
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("sidebar-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  if (!user) return <>{children}</>;

  const items = navItemsForRole(user.role);

  return (
    <div className="app-layout">
      <aside className={`app-sidebar ${mobileOpen ? "app-sidebar--open" : ""}`}>
        <SidebarNav
          items={items}
          activeNav={activeNav}
          onNavigate={onNavigate}
          onLogout={logout}
          onClose={() => setMobileOpen(false)}
        />
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="關閉導航"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <main id="app-main" className="app-content">
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={mobileOpen ? "關閉導航" : "開啟導航"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="sidebar-toggle-bar" />
          <span className="sidebar-toggle-bar" />
          <span className="sidebar-toggle-bar" />
        </button>
        <div className="app-content-body">{children}</div>
        <SiteLegalFooter className="site-legal-footer--shell" />
      </main>
    </div>
  );
}
