/**
 * Where the HUD editor's dialogs, menus and popovers portal to: the TF2
 * palette root (`.tf2hud-theme`, which carries the `--app-*` tokens).
 *
 * In full screen only the full-screen element's subtree is drawn, so the root
 * is the themed element inside it (the browser game's HUD root, when the
 * editor is open over a full-screen match) — a portal into the page's own
 * root would be invisible there. Pure DOM logic, tested with fakes.
 */

export const THEME_ROOT = '.tf2hud-theme';

export interface PortalDoc {
  querySelector<E extends Element = Element>(selectors: string): E | null;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
}

export function portalRoot(doc: PortalDoc = document): HTMLElement | null {
  const fs = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  if (fs) {
    const own = fs.matches(THEME_ROOT) ? fs : fs.querySelector(THEME_ROOT);
    return (own ?? fs) as HTMLElement;
  }
  return doc.querySelector<HTMLElement>(THEME_ROOT);
}
