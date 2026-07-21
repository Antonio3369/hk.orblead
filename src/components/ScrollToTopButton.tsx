import { useEffect, useState } from "react";
import { getMainScrollEl, scrollMainToTop } from "@/utils/mainScroll";

const SHOW_AFTER_PX = 280;

interface ScrollToTopButtonProps {
  /** 切換主視圖時重置顯示狀態（對齊 ali N7 BackToTop 的 pathname 行為） */
  scrollResetKey?: string | null;
}

/**
 * 手機長列表回頂：監聽 .app-content（與 AppLayout 一致），樣式對齊 ali N7 BackToTop。
 */
export function ScrollToTopButton({ scrollResetKey = null }: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);

    const el = getMainScrollEl();
    const readTop = () => (el ? el.scrollTop : window.scrollY || 0);
    const onScroll = () => setVisible(readTop() > SHOW_AFTER_PX);

    onScroll();

    if (el) {
      el.addEventListener("scroll", onScroll, { passive: true });
      return () => el.removeEventListener("scroll", onScroll);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [scrollResetKey]);

  return (
    <button
      type="button"
      className={`scroll-to-top-btn${visible ? " scroll-to-top-btn--visible" : ""}`}
      aria-label="返回頂部"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => scrollMainToTop({ smooth: true })}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 5v14M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
