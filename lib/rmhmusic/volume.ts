/** Volume change per keypress (Shift+ArrowUp / Shift+ArrowDown). */
export const VOLUME_STEP = 0.05;

/**
 * The volume after nudging `current` by `delta`, clamped to 0-1 and snapped to
 * the step grid so repeated presses land on clean values (0.7 → 0.75 → 0.8,
 * not 0.7500000000000001).
 */
export function stepVolume(current: number, delta: number): number {
  const next = Math.min(1, Math.max(0, current + delta));
  return Number((Math.round(next / VOLUME_STEP) * VOLUME_STEP).toFixed(2));
}
