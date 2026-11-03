'use client';

import { useSyncExternalStore } from 'react';

/**
 * The viewports that get the condensed HUD: a phone held upright (narrow) or on
 * its side (short). The same condition the stylesheet's compact rules used, so a
 * layout the CSS treats as small and the HUD the game mounts can never disagree.
 */
export const COMPACT_QUERY = '(max-width: 780px), (max-height: 560px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(COMPACT_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** True on a phone-sized viewport. The HUD only mounts client-side, so no SSR flash. */
export function useCompactHud(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}
