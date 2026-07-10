import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NeoButton } from "@/components/NeoButton";
import { useAuth } from "@/context/AuthContext";

interface UserHeaderActionsProps {
  onOpenAdmin?: () => void;
  onOpenUserCenter?: () => void;
}

export function UserHeaderActions({ onOpenAdmin, onOpenUserCenter }: UserHeaderActionsProps) {
  const { user, logout } = useAuth();
  const initial = user?.displayName?.charAt(0) ?? "?";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    document.body.classList.add("shell-menu-open");
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("shell-menu-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const actionItems = (
    <>
      {onOpenUserCenter && (
        <NeoButton
          size="sm"
          onClick={() => {
            closeMenu();
            onOpenUserCenter();
          }}
        >
          用戶中心
        </NeoButton>
      )}
      {user?.role === "admin" && onOpenAdmin && (
        <NeoButton
          size="sm"
          onClick={() => {
            closeMenu();
            onOpenAdmin();
          }}
        >
          後臺管理
        </NeoButton>
      )}
      <span className="user-chip">
        <span className="user-chip-avatar">{initial}</span>
        <span>{user?.displayName}</span>
      </span>
      <NeoButton
        size="sm"
        onClick={() => {
          closeMenu();
          logout();
        }}
      >
        登出
      </NeoButton>
    </>
  );

  return (
    <>
      <div className="shell-actions shell-actions--wide">{actionItems}</div>

      <div className="shell-actions shell-actions--compact">
        <span className="user-chip user-chip--compact">
          <span className="user-chip-avatar">{initial}</span>
        </span>
        <NeoButton
          size="xs"
          className="shell-menu-btn"
          active={menuOpen}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "關閉選單" : "開啟選單"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="shell-menu-btn__icon" aria-hidden>
            <span className="shell-menu-btn__bar" />
            <span className="shell-menu-btn__bar" />
            <span className="shell-menu-btn__bar" />
          </span>
        </NeoButton>
      </div>

      {menuOpen &&
        createPortal(
          <>
            <button type="button" className="shell-menu-backdrop" aria-label="關閉選單" onClick={closeMenu} />
            <div
              className="shell-menu-panel"
              role="dialog"
              aria-label="帳號選單"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="shell-menu-user">{user?.displayName}</p>
              <div className="shell-menu-actions">
                {onOpenUserCenter && (
                  <NeoButton
                    size="sm"
                    className="shell-menu-action"
                    onClick={() => {
                      closeMenu();
                      onOpenUserCenter();
                    }}
                  >
                    用戶中心
                  </NeoButton>
                )}
                {user?.role === "admin" && onOpenAdmin && (
                  <NeoButton
                    size="sm"
                    className="shell-menu-action"
                    onClick={() => {
                      closeMenu();
                      onOpenAdmin();
                    }}
                  >
                    後臺管理
                  </NeoButton>
                )}
                <NeoButton
                  size="sm"
                  className="shell-menu-action"
                  onClick={() => {
                    closeMenu();
                    logout();
                  }}
                >
                  登出
                </NeoButton>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
