/**
 * Muting a caller for a while — the durations on offer and how long each lasts.
 *
 * Client-safe on purpose: the incoming-call banner builds its menu from this,
 * and the API route validates against the same keys, so the two cannot disagree
 * about what "a day" is. Enforcement lives in `lib/call/state.ts#canCall` (pure)
 * and the socket handlers (which read the `call_mute` table); nothing here
 * decides whether a call may ring.
 */

export const CALL_MUTE_DURATIONS = {
  '1h': 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
} as const;

export type CallMuteDuration = keyof typeof CALL_MUTE_DURATIONS;

/** In menu order, shortest first. */
export const CALL_MUTE_DURATION_KEYS = Object.keys(CALL_MUTE_DURATIONS) as CallMuteDuration[];

export function isCallMuteDuration(v: unknown): v is CallMuteDuration {
  return typeof v === 'string' && Object.hasOwn(CALL_MUTE_DURATIONS, v);
}

/** When a mute started at `now` for `duration` lapses. */
export function muteUntil(duration: CallMuteDuration, now: number = Date.now()): Date {
  return new Date(now + CALL_MUTE_DURATIONS[duration]);
}

/** Whether a mute ending at `until` still applies at `now`. A mute is half-open: it lapses AT `until`. */
export function isMuteActive(until: Date | number | null | undefined, now: number = Date.now()): boolean {
  if (until === null || until === undefined) return false;
  return (typeof until === 'number' ? until : until.getTime()) > now;
}
