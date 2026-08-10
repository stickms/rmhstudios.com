'use client';

/**
 * Light / dark for `/pf2ecal`.
 *
 * The page has no relationship to the site's themes — it is monochrome by brief
 * and registered as its own design tier — so it carries its own three-way
 * preference: **Auto** (follow the OS), Light, Dark. Auto is the default,
 * because a calendar people open at 11pm should already be dark when their
 * phone is.
 *
 * ## Why the stored shape has a hole in it
 *
 * `pf2ecal-theme` persists `{"mode":"auto"}` on Auto and
 * `{"mode":"dark","dark":true}` on an explicit choice. The resolved `dark` flag
 * is deliberately ABSENT while the mode is Auto: that flag is what the pre-paint
 * script in `app/routes/__root.tsx` reads to paint the document before any
 * bundle loads, and a value written while the OS was dark is simply wrong the
 * next morning if the visitor's phone has switched to light in the meantime.
 * Leaving it out routes the script back through `prefers-color-scheme`, which
 * cannot go stale. `APP_ROUTE_THEME_BG['/pf2ecal'].system` is the flag that says
 * "absent means ask the OS" rather than "absent means dark".
 *
 * ## Two things get painted, not one
 *
 * `.pf2e` paints the page. `<html>`/`<body>` are painted separately, by the site
 * — and that is the bug this module was written for: the board went dark from
 * `prefers-color-scheme` while the document underneath stayed Daylight white.
 * On a desktop you never see it, because the page covers the viewport. On a
 * phone every rubber-band overscroll flashes a white gutter above a black page.
 * So the ground and the page resolve from ONE preference, here.
 */

import { useCallback, useEffect, useState } from 'react';
import { APP_ROUTE_THEME_BG, paintDocumentGround } from '@/stores/themeStore';

export type Pf2eThemeMode = 'auto' | 'light' | 'dark';

const GROUND = APP_ROUTE_THEME_BG['/pf2ecal'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_QUERY).matches
  );
}

/** The stored preference, or Auto for a first visit / unreadable storage. */
export function readMode(): Pf2eThemeMode {
  try {
    const raw = localStorage.getItem(GROUND.key);
    const parsed = raw ? (JSON.parse(raw) as { mode?: unknown }) : null;
    const mode = parsed?.mode;
    if (mode === 'light' || mode === 'dark' || mode === 'auto') return mode;
  } catch {
    // Private mode, a quota error, or something else's key at the same name.
  }
  return 'auto';
}

function writeMode(mode: Pf2eThemeMode): void {
  try {
    localStorage.setItem(
      GROUND.key,
      // See the module note: no resolved flag on Auto, on purpose.
      JSON.stringify(mode === 'auto' ? { mode } : { mode, dark: mode === 'dark' }),
    );
  } catch {
    // A preference that cannot be saved still applies for this visit.
  }
}

/** Which of the two palettes a mode means right now. */
export function resolveMode(mode: Pf2eThemeMode): 'light' | 'dark' {
  if (mode === 'auto') return prefersDark() ? 'dark' : 'light';
  return mode;
}

/**
 * The page's theme, applied to the document as well as reported.
 *
 * The apply half cannot be left to `Providers`: its theme effect deliberately
 * does not re-run on a pathname change, so a toggle here would repaint nothing
 * until the next full load. It calls `paintDocumentGround` — the same function
 * `Providers` uses — so the two can never disagree about what "dark" looks like.
 */
export function usePf2eTheme(): {
  mode: Pf2eThemeMode;
  resolved: 'light' | 'dark';
  setMode: (next: Pf2eThemeMode) => void;
} {
  // Auto on the server AND on the first client render: reading storage in the
  // initialiser would give the server one answer and hydration another, and
  // React reports that as a mismatch on the control's `aria-checked`. The
  // COLOURS do not wait for this — the pre-paint script has already resolved
  // them onto <html> — so what settles a frame later is which segment is lit.
  const [mode, setModeState] = useState<Pf2eThemeMode>('auto');
  const [hydrated, setHydrated] = useState(false);
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = readMode();
    setModeState(stored);
    setResolved(resolveMode(stored));
    setHydrated(true);
  }, []);

  // Apply on every change AFTER the stored value has landed. Applying before it
  // does would repaint the document to Auto for one frame on a soft navigation,
  // undoing what the visitor chose last time.
  useEffect(() => {
    if (!hydrated) return;
    const next = resolveMode(mode);
    setResolved(next);
    paintDocumentGround(next === 'dark' ? GROUND.dark : GROUND.light, next === 'dark');
  }, [hydrated, mode]);

  // Auto means auto: if the OS flips while the tab is open — sunset on a phone
  // with scheduled appearance — the page follows without a reload.
  useEffect(() => {
    if (!hydrated || mode !== 'auto') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    const sync = () => {
      const next = query.matches ? 'dark' : 'light';
      setResolved(next);
      paintDocumentGround(next === 'dark' ? GROUND.dark : GROUND.light, next === 'dark');
    };
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [hydrated, mode]);

  const setMode = useCallback((next: Pf2eThemeMode) => {
    writeMode(next);
    setModeState(next);
  }, []);

  return { mode, resolved, setMode };
}
