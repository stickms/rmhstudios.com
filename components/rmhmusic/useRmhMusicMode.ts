'use client';

/**
 * Light / dark for `/rmhmusic` — the browser half (`lib/rmhmusic/learn/mode.ts` is the pure half).
 *
 * ## Why nothing here can flash
 *
 * The COLOURS never wait for this module. `rmhmusic.css` defines both palettes on
 * `.rmhmusic-theme`: light as the base, dark under `@media (prefers-color-scheme: dark)` (unless
 * `<html data-app-dark="0">`) and under `<html data-app-dark="1">`. So the server-rendered HTML is
 * right for the system preference with no script at all, and the site's pre-paint script
 * (`app/routes/__root.tsx`, driven by the `/rmhmusic` entry in `APP_ROUTE_THEME_BG`) applies a
 * stored choice — `data-app-dark`, the document ground and `color-scheme` — before first paint.
 *
 * What this module adds is the runtime: the toggle, following the system while nothing is
 * stored, and a client-side navigation INTO the app (no pre-paint script runs then, so the
 * layout's layout effect applies the mode before the browser paints the new route). It writes
 * the ground through `paintDocumentGround` with the colours read from `APP_ROUTE_THEME_BG`, the
 * same function and the same map the pre-paint script and `Providers` use.
 *
 * The toggle's pressed state needs the resolved mode, which the server cannot know: the snapshot
 * is `null` on the server and on the hydrating render (the toggle shows a same-size placeholder),
 * and the real value arrives right after mount.
 */

import { useLayoutEffect, useSyncExternalStore } from 'react';
import { isAppThemeRoute } from '@/components/Providers';
import { MODE_STORAGE_KEY, resolveMode, serializeMode, type Mode } from '@/lib/rmhmusic/learn/mode';
import {
  APP_ROUTE_THEME_BG,
  APP_THEME_BG,
  appRouteGround,
  paintDocumentGround,
} from '@/stores/themeStore';

const GROUND = APP_ROUTE_THEME_BG['/rmhmusic'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

let current: Mode | null = null;
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the system preference stands in.
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

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The mode on screen, or null on the server and until the app's root has mounted. */
export function useMode(): Mode | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/** Switch to `mode` and remember it (for this visit only when storage is blocked). */
export function setMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, serializeMode(mode));
  } catch {
    // The choice still applies until the page is closed.
  }
  apply(mode);
}

/**
 * Mount once, in the app's root layout: applies the mode, follows the system while no choice is
 * stored, and hands the document back when the learner leaves the app.
 */
export function useRmhMusicModeRoot(): void {
  useLayoutEffect(() => {
    apply(resolveMode(readStored(), systemDark()));
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
    const onSystem = () => apply(resolveMode(readStored(), systemDark()));
    query?.addEventListener('change', onSystem);
    return () => {
      query?.removeEventListener('change', onSystem);
      current = null;
      for (const fn of listeners) fn();
      // Leaving the app. A site page gets its ground back from `Providers`, whose theme effect
      // re-runs when the route leaves the app tier; only the attribute is ours to take away now.
      // Another full-screen app keeps the app tier, so `Providers` will not re-run: give it the
      // ground the pre-paint script would have painted for it.
      const next = window.location.pathname;
      if (next === '/rmhmusic' || next.startsWith('/rmhmusic/')) return;
      if (isAppThemeRoute(next)) {
        const ground = appRouteGround(next);
        paintDocumentGround(ground?.bg ?? APP_THEME_BG, ground ? ground.dark : null);
      } else {
        document.documentElement.removeAttribute('data-app-dark');
      }
    };
  }, []);
}
