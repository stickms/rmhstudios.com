'use client';

import { useSyncExternalStore } from 'react';

// The `xl` breakpoint — where the context rail switches from `display:none` to
// visible (`hidden xl:block`). Widgets in that rail gate their fetch/polling
// on this so mobile clients don't pay for a sidebar they never see.
const DESKTOP_QUERY = '(min-width: 1280px)';

function subscribe(callback: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Returns true when the viewport is >= 1280px (the `xl` breakpoint). SSR-safe via
 * useSyncExternalStore (server snapshot is false, so it never mismatches
 * hydration). Mirrors {@link useIsMobile}.
 */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
