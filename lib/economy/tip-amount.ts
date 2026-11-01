import { TIP_MAX, TIP_MIN } from './tip-limits';

/**
 * Turn what the custom-amount box holds into a tip the server will accept:
 * a whole number from {@link TIP_MIN} to {@link TIP_MAX}. Empty or non-numeric
 * input falls back to the minimum. This is a convenience only — the route and
 * `tipSchema` remain the authority on what is allowed.
 */
export function parseTipAmount(raw: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return TIP_MIN;
  return Math.min(TIP_MAX, Math.max(TIP_MIN, n));
}
