'use client';

/** Compatibility exports for feature modules that still accept motion flags.
 * The site uses one animation scheme, with no preference listeners or store.
 */
export function useReducedMotion(): boolean {
  return false;
}

/**
 * Imperative one-shot check for non-React call sites (event handlers, utility
 * functions). Prefer the hook inside components.
 */
export function prefersReducedMotion(): boolean {
  return false;
}
