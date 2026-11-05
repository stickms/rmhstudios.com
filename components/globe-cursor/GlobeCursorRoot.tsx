'use client';

import { Suspense, lazy, useEffect, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { isNativeCursorRoute } from '@/lib/native-cursor-routes';
import { useGlobeCursorStore } from '@/stores/globeCursorStore';

/**
 * The globe cursor's gate, mounted once by `__root.tsx`.
 *
 * It is drawn only on site pages: games and apps keep the system cursor
 * (`lib/native-cursor-routes.ts`). Its static closure is the settings store, the
 * route list (the catalog, already in the main bundle) and nothing else; the engine (and
 * the Thurston eversion it samples) is a lazy chunk that loads only when the
 * cursor is enabled on a device with a fine, hovering pointer. A phone never
 * downloads it, and neither does a desktop with the cursor switched off.
 */
const GlobeCursor = lazy(() => import('./GlobeCursor'));

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

export function GlobeCursorRoot() {
  const hydrate = useGlobeCursorStore((s) => s.hydrate);
  const hydrated = useGlobeCursorStore((s) => s.hydrated);
  const enabled = useGlobeCursorStore((s) => s.settings.enabled);
  const [fine, setFine] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    hydrate();
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(FINE_POINTER);
    setFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [hydrate]);

  // Games and apps use the plain system cursor (or their own); the globe is for the site pages.
  if (!hydrated || !enabled || !fine || isNativeCursorRoute(pathname)) return null;
  return (
    <Suspense fallback={null}>
      <GlobeCursor />
    </Suspense>
  );
}
