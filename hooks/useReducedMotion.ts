'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `true` when the user has requested reduced motion
 * (`prefers-reduced-motion: reduce`). Use it to gate JS-driven animations
 * (Framer Motion, GSAP, canvas-confetti) that CSS `@media` rules can't reach.
 *
 * SSR-safe: returns `false` on the server and during the first client render,
 * then updates after mount and on preference changes.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Imperative one-shot check for non-React call sites (event handlers, utility
 * functions). Prefer the hook inside components.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
