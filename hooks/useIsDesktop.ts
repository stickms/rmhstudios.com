"use client";

import { useSyncExternalStore } from "react";

// The `lg` breakpoint — where the right sidebar switches from `display:none` to
// visible (`hidden lg:block`). Widgets in that sidebar gate their fetch/polling
// on this so mobile clients don't pay for a sidebar they never see.
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Returns true when the viewport is >= 1024px (the `lg` breakpoint). SSR-safe via
 * useSyncExternalStore (server snapshot is false, so it never mismatches
 * hydration). Mirrors {@link useIsMobile}.
 */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
