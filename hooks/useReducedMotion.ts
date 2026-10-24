'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const media = () => (typeof window === 'undefined' ? undefined : window.matchMedia?.(QUERY));
const subscribe = (onChange: () => void) => {
  const query = media();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
};
const serverSnapshot = () => false;

/** OS accessibility preference only; no separate application motion setting. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, serverSnapshot);
}

/**
 * Imperative one-shot check for non-React call sites (event handlers, utility
 * functions). Prefer the hook inside components.
 */
export function prefersReducedMotion(): boolean {
  return media()?.matches ?? false;
}
