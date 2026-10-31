/** Minutes a listener can pick for the sleep timer; `null` means off. */
export const SLEEP_TIMER_MINUTES = [15, 30, 45, 60] as const;

/** The last stretch of the timer over which the volume fades to silence. */
export const SLEEP_FADE_MS = 20_000;

/** The option after `current` in the cycle Off → 15 → 30 → 45 → 60 → Off. */
export function nextSleepOption(current: number | null): number | null {
  if (current === null) return SLEEP_TIMER_MINUTES[0];
  const i = SLEEP_TIMER_MINUTES.indexOf(current as (typeof SLEEP_TIMER_MINUTES)[number]);
  return i >= 0 && i < SLEEP_TIMER_MINUTES.length - 1 ? SLEEP_TIMER_MINUTES[i + 1] : null;
}

/**
 * Volume to play at with `remainingMs` left on the timer: the listener's own
 * level until the fade begins, then a straight ramp down to 0.
 */
export function fadedVolume(baseVolume: number, remainingMs: number, fadeMs = SLEEP_FADE_MS): number {
  if (remainingMs <= 0) return 0;
  if (remainingMs >= fadeMs) return baseVolume;
  return baseVolume * (remainingMs / fadeMs);
}

/** `m:ss` for the countdown shown next to the button. */
export function formatRemaining(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
