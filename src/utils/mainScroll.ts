const MAIN_SELECTOR = ".app-content";

export function getMainScrollEl(): HTMLElement | null {
  return document.querySelector(MAIN_SELECTOR);
}

export function getMainScrollTop(): number {
  return getMainScrollEl()?.scrollTop ?? window.scrollY;
}

export function scrollMainTo(top: number, options?: { smooth?: boolean }) {
  const y = Math.max(0, Math.round(top));
  const behavior = options?.smooth ? "smooth" : "auto";
  const el = getMainScrollEl();
  if (el) {
    el.scrollTo({ top: y, behavior });
    return;
  }
  window.scrollTo({ top: y, behavior });
}

export function scrollMainToTop(options?: { smooth?: boolean }) {
  scrollMainTo(0, options);
}
