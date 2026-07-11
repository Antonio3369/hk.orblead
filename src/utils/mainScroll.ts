const MAIN_SELECTOR = ".app-content";

export function getMainScrollEl(): HTMLElement | null {
  return document.querySelector(MAIN_SELECTOR);
}

export function getMainScrollTop(): number {
  return getMainScrollEl()?.scrollTop ?? window.scrollY;
}

export function scrollMainTo(top: number) {
  const el = getMainScrollEl();
  if (el) {
    el.scrollTop = top;
    return;
  }
  window.scrollTo(0, top);
}

export function scrollMainToTop() {
  scrollMainTo(0);
}
