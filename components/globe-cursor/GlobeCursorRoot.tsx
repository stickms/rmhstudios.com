'use client';

import { Suspense, lazy, useEffect, useState } from 'react';
import { useGlobeCursorStore } from '@/stores/globeCursorStore';

/**
 * The globe cursor's gate, mounted once by `__root.tsx`.
 *
 * Its static closure is the settings store and nothing else; the engine (and
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

  useEffect(() => {
    hydrate();
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(FINE_POINTER);
    setFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [hydrate]);

  if (!hydrated || !enabled || !fine) return null;
  return (
    <Suspense fallback={null}>
      <GlobeCursor />
    </Suspense>
  );
}
