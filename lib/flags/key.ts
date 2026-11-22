/**
 * Client-safe pieces of the feature-flag contract. `evaluate.ts` imports
 * `node:crypto` for bucketing, so anything a browser bundle needs (the admin
 * console) lives here and is re-exported from there for the server callers.
 */

/** A flag key: lowercase, starts with a letter, 2-64 chars of [a-z0-9_.-]. */
export const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;

export function isValidFlagKey(key: string): boolean {
  return FLAG_KEY_PATTERN.test(key);
}

/** Turn what a rollout box holds into a whole percentage in 0-100 (blank/NaN → 0). */
export function clampRollout(raw: string | number): number {
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.trunc(n)));
}
