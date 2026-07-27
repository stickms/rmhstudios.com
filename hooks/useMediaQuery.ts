'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query from React.
 *
 * The generic form of {@link useIsDesktop} / {@link useIsMobile}, for the cases
 * where a component's own breakpoint is not one of those two — the shell's rails
 * and home deck each appear at the width that actually affords them, and their
 * data fetching has to agree with the CSS that reveals them or the client pays
 * for a column it cannot see.
 *
 * SSR-safe: the server snapshot is `false`, so it never mismatches hydration.
 * Backed by `matchMedia`, so the callback fires only when the breakpoint is
 * crossed rather than on every pixel of a resize.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
