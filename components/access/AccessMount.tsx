'use client';

/**
 * Global runtime for the access & comfort additions. Mounted by `Providers`
 * inside the silent boundary; renders nothing until a shake opens the feedback
 * sheet. Everything here runs after hydration and the sheet is code-split.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { games } from '@/lib/games';
import { useAccessPrefs } from '@/lib/access/use-access-prefs';
import {
  SHAKE_OK_KEY,
  applyAccessPrefs,
  getAccessPrefs,
  markAccessHydrated,
} from '@/lib/access/prefs';
import { isTouchPhone, motionPermissionGated, watchForShake } from '@/lib/access/shake';

const FeedbackSheet = lazy(() =>
  import('@/components/access/FeedbackSheet').then((m) => ({ default: m.FeedbackSheet })),
);

const GAME_HREFS = games.map((g) => g.href);

export function AccessMount() {
  const prefs = useAccessPrefs();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const onGame = GAME_HREFS.some((h) => pathname === h || pathname.startsWith(`${h}/`));

  // One-time: let format helpers read the stored preference, re-assert the
  // pre-paint state, and (dev builds only) honour ?pseudo=1 for the en-XA tool.
  useEffect(() => {
    markAccessHydrated();
    applyAccessPrefs(document.documentElement, getAccessPrefs());
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(window.location.search).get('pseudo');
      if (q === '1' || q === '0') {
        void Promise.all([
          import('@/lib/access/pseudo-locale'),
          import('@/lib/i18n/instances'),
        ]).then(([{ enablePseudoLocale }, { clientI18n }]) =>
          enablePseudoLocale(clientI18n, q === '1'),
        );
      }
    }
  }, []);

  // Bedtime mode follows the clock: re-check once a minute, only while it is on.
  useEffect(() => {
    if (!prefs.bedtime) {
      applyAccessPrefs(document.documentElement, prefs);
      return;
    }
    applyAccessPrefs(document.documentElement, prefs);
    const id = window.setInterval(
      () => applyAccessPrefs(document.documentElement, getAccessPrefs()),
      60_000,
    );
    return () => window.clearInterval(id);
  }, [prefs]);

  // Shake to report: phones only, opt-out, never on a game route, and on iOS only
  // after the member granted motion access from the settings toggle.
  useEffect(() => {
    if (!prefs.shake || onGame || !isTouchPhone()) return;
    if (motionPermissionGated()) {
      try {
        if (localStorage.getItem(SHAKE_OK_KEY) !== '1') return;
      } catch {
        return;
      }
    }
    return watchForShake(() => setOpen(true));
  }, [prefs.shake, onGame]);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <FeedbackSheet open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
