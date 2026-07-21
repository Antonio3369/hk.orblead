import { HomeEntryIconSvg } from "@/components/HomeEntryIcon";
import { navItemLabel, type NavItem, type NavKey } from "@/config/navigation";
import { BRAND } from "@/config/branding";
import { useAuth } from "@/context/AuthContext";

function NavIcon({ kind }: { kind: NavItem["icon"] }) {
  if (kind === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (kind === "admin") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (kind === "settings") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
      </svg>
    );
  }
  return <HomeEntryIconSvg kind={kind} />;
}

interface SidebarNavProps {
  items: NavItem[];
  activeNav: NavKey | null;
  onNavigate: (key: NavKey) => void;
  onLogout: () => void;
  onClose?: () => void;
}

export function SidebarNav({ items, activeNav, onNavigate, onLogout, onClose }: SidebarNavProps) {
  const { user } = useAuth();
  const mainItems = items.filter((i) => i.section === "main");
  const footerItems = items.filter((i) => i.section === "footer");

  const renderItem = (item: NavItem) => (
    <button
      key={item.key}
      type="button"
      className={`sidebar-nav-item ${activeNav === item.key ? "sidebar-nav-item--active" : ""}`}
      onClick={() => {
        onNavigate(item.key);
        onClose?.();
      }}
    >
      <span className="sidebar-nav-icon">
        <NavIcon kind={item.icon} />
      </span>
      <span className="sidebar-nav-label">{user ? navItemLabel(item, user.role) : item.label}</span>
    </button>
  );

  return (
    <nav className="sidebar-nav" aria-label="主導航">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" />
            <path d="M7 16l3-4 3 2 5-7" />
          </svg>
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-title">{BRAND.companyName}</span>
          <span className="sidebar-brand-sub">商戶交易看板</span>
        </div>
      </div>

      <div className="sidebar-nav-main">{mainItems.map(renderItem)}</div>

      <div className="sidebar-nav-footer">
        {footerItems.map(renderItem)}
        <div className="sidebar-user">
          <span className="sidebar-user-avatar">{user?.displayName?.charAt(0) ?? "?"}</span>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{user?.displayName}</span>
            <span className="sidebar-user-role">
              {user?.role === "admin" ? "管理員" : user?.role === "leader" ? "主管" : "銷售"}
            </span>
          </div>
        </div>
        <button type="button" className="sidebar-logout-btn" onClick={() => {
          onLogout();
          onClose?.();
        }}>
          登出
        </button>
      </div>
    </nav>
  );
}
