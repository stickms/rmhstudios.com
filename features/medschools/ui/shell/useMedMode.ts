/**
 * Light / dark for `/med`: the browser half (`engine/mode.ts` is the pure half). RMH Music's design, one for
 * one (`components/rmhmusic/useRmhMusicMode.ts`), so read its header for the whole argument; the short version:
 *
 * The COLOURS never wait for this module. `medschools.css` defines both palettes: light is the base, dark applies under
 * `prefers-color-scheme: dark` (unless `<html data-app-dark="0">`) and under `<html data-app-dark="1">`, so the
 * server-rendered HTML is right for the system with no script. The pre-paint script (the `/med` entry of
 * `APP_ROUTE_THEME_BG`) applies a stored choice, the document ground and `color-scheme` before first paint. This
 * module adds the runtime: the toggle, following the system while nothing is stored, and a client navigation INTO the
 * app, where no pre-paint script runs. The toggle's pressed state is `null` on the server and the hydrating render.
 */

import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import { isAppThemeRoute } from '@/components/Providers';
import { APP_ROUTE_THEME_BG, APP_THEME_BG, appRouteGround, paintDocumentGround } from '@/stores/themeStore';
import { MODE_STORAGE_KEY, resolveMode, serializeMode, type Mode } from '../../engine/mode';

const BASE = '/med';
const GROUND = APP_ROUTE_THEME_BG[BASE]!;
const DARK_QUERY = '(prefers-color-scheme: dark)';

let current: Mode | null = null;
const listeners = new Set<() => void>();
/** A choice made this visit that storage would not keep (blocked or full): it stands in for the stored value. */
let unsaved: string | null = null;

function readStored(): string | null {
  if (unsaved !== null) return unsaved;
  try {
    return localStorage.getItem(MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function systemDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

function apply(mode: Mode) {
  current = mode;
  paintDocumentGround(mode === 'dark' ? GROUND.dark : GROUND.light, mode === 'dark');
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Switch to `mode` and remember it (for this visit only when storage is blocked). */
export function setMedMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, serializeMode(mode));
    unsaved = null;
  } catch {
    unsaved = serializeMode(mode);
  }
  apply(mode);
}

/** The mode on screen (null on the server and until the app's root has mounted) and the way to change it. */
export function useMedMode(): { mode: Mode | null; setMode: (mode: Mode) => void; toggle: () => void } {
  const mode = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const toggle = useCallback(() => setMedMode(current === 'dark' ? 'light' : 'dark'), []);
  return { mode, setMode: setMedMode, toggle };
}

/** Mount once, in the app's root: applies the mode, follows the system while no choice is stored, hands the document back. */
export function useMedModeRoot(): void {
  useLayoutEffect(() => {
    apply(resolveMode(readStored(), systemDark()));
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
    const onSystem = () => apply(resolveMode(readStored(), systemDark()));
    query?.addEventListener('change', onSystem);
    return () => {
      query?.removeEventListener('change', onSystem);
      current = null;
      for (const fn of listeners) fn();
      // Leaving the app: a site page gets its ground back from `Providers`; another full-screen app keeps the app tier,
      // so `Providers` will not re-run and is given the ground the pre-paint script would have painted for it.
      const next = window.location.pathname;
      if (next === BASE || next.startsWith(`${BASE}/`)) return;
      if (isAppThemeRoute(next)) {
        const ground = appRouteGround(next);
        paintDocumentGround(ground?.bg ?? APP_THEME_BG, ground ? ground.dark : null);
      } else {
        document.documentElement.removeAttribute('data-app-dark');
      }
    };
  }, []);
}
