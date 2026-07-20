'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from '@/stores/themeStore';

/**
 * Returns `true` when the user has requested reduced motion — either via the OS
 * (`prefers-reduced-motion: reduce`) or the account-level toggle (§13). Use it
 * to gate JS-driven animations (Framer Motion, GSAP, canvas-confetti) that CSS
 * `@media` rules can't reach.
 *
 * SSR-safe: returns `false` on the server and during the first client render,
 * then updates after mount and on preference changes.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const forced = useThemeStore((s) => s.reduceMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced || forced;
}

/**
 * Imperative one-shot check for non-React call sites (event handlers, utility
 * functions). Prefer the hook inside components.
 */
export function prefersReducedMotion(): boolean {
  if (useThemeStore.getState().reduceMotion) return true;
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
