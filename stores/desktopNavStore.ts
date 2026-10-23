import { create } from 'zustand';

/**
 * How the site shell navigates on a wide screen (≥1120px, where the frame has a
 * left track to give it).
 *
 * - `globe` (default) — the liquid globe docked in the left track, always up,
 *   drifting on its own; the RMH orb is retired at that width because the globe
 *   it opens is already on screen.
 * - `rail` — the classic text navigation panel, with the orb as the
 *   full-screen switcher.
 *
 * Per device, like density and font scale: it is a statement about the screen,
 * not the account. The pre-paint script in `app/routes/__root.tsx` sets
 * `data-desktop-nav="rail"` on <html> from the same key before first paint, so
 * the shell's grid never reflows on hydration in either mode; this store keeps
 * that attribute in step with the setting afterwards.
 */

export type DesktopNavMode = 'globe' | 'rail';

/** localStorage key — must match the pre-paint script in `app/routes/__root.tsx`. */
export const DESKTOP_NAV_KEY = 'rmh-desktop-nav';
export const DEFAULT_DESKTOP_NAV: DesktopNavMode = 'globe';

function read(): DesktopNavMode {
  try {
    return localStorage.getItem(DESKTOP_NAV_KEY) === 'rail' ? 'rail' : DEFAULT_DESKTOP_NAV;
  } catch {
    return DEFAULT_DESKTOP_NAV;
  }
}

function apply(mode: DesktopNavMode) {
  if (mode === 'rail') document.documentElement.setAttribute('data-desktop-nav', 'rail');
  else document.documentElement.removeAttribute('data-desktop-nav');
}

interface DesktopNavState {
  mode: DesktopNavMode;
  hydrated: boolean;
  hydrate: () => void;
  setMode: (mode: DesktopNavMode) => void;
}

export const useDesktopNavStore = create<DesktopNavState>((set, get) => ({
  mode: DEFAULT_DESKTOP_NAV,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated || typeof window === 'undefined') return;
    set({ mode: read(), hydrated: true });
    // Another tab changed it: follow, so two open tabs never disagree on layout.
    window.addEventListener('storage', (e) => {
      if (e.key !== DESKTOP_NAV_KEY) return;
      const mode = read();
      apply(mode);
      set({ mode });
    });
  },
  setMode: (mode) => {
    try {
      if (mode === DEFAULT_DESKTOP_NAV) localStorage.removeItem(DESKTOP_NAV_KEY);
      else localStorage.setItem(DESKTOP_NAV_KEY, mode);
    } catch {
      // Private mode / quota: the setting still applies for this page view.
    }
    apply(mode);
    set({ mode });
  },
}));
