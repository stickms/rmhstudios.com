/**
 * The mute choices a direct conversation offers (sprint 13 20). Pure and client-safe. "Mentions only" is not offered:
 * every message in a direct conversation is addressed to the member.
 */

export const DM_MUTE_CHOICES = ['1h', '8h', '7d', 'forever'] as const;
export type DmMuteChoice = (typeof DM_MUTE_CHOICES)[number];

const HOUR_MS = 60 * 60 * 1000;
const DURATION_MS: Record<Exclude<DmMuteChoice, 'forever'>, number> = {
  '1h': HOUR_MS,
  '8h': 8 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
};

/** "Until I turn it back on": a far-future date, the same stamp every other conversation mute uses. */
export const DM_MUTE_FOREVER = new Date('9999-12-31T00:00:00.000Z');

/** The `muteUntil` a choice means. */
export function dmMuteUntil(choice: DmMuteChoice, now: Date = new Date()): Date {
  if (choice === 'forever') return DM_MUTE_FOREVER;
  return new Date(now.getTime() + DURATION_MS[choice]);
}

/** A stored `muteUntil` that is still in force, as a Date; null when unset, past or unparsable. */
export function activeMuteUntil(muteUntil: string | null | undefined, now: Date = new Date()): Date | null {
  if (!muteUntil) return null;
  const ms = Date.parse(muteUntil);
  if (!Number.isFinite(ms) || ms <= now.getTime()) return null;
  return new Date(ms);
}

/** A mute this far out is the open-ended one, which has no time to show. */
export function isOpenEndedMute(until: Date): boolean {
  return until.getTime() >= Date.UTC(3000, 0, 1);
}
