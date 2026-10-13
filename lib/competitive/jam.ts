/** Game jams (E7) — phases and scoring. Pure and client-safe. */

export const JAM_CATEGORIES = ['fun', 'creativity', 'theme', 'polish'] as const;
export type JamCategory = (typeof JAM_CATEGORIES)[number];

export type JamPhase = 'upcoming' | 'open' | 'rating' | 'done';

export interface JamWindow {
  startsAt: Date;
  submitEndsAt: Date;
  ratingEndsAt: Date;
}

/** upcoming -> open (build + submit, rating allowed) -> rating (rating only) -> done. */
export function jamPhase(jam: JamWindow, now: Date = new Date()): JamPhase {
  const t = now.getTime();
  if (t < jam.startsAt.getTime()) return 'upcoming';
  if (t < jam.submitEndsAt.getTime()) return 'open';
  if (t < jam.ratingEndsAt.getTime()) return 'rating';
  return 'done';
}

/** The theme is secret until the jam starts. */
export function themeVisible(jam: Pick<JamWindow, 'startsAt'>, now: Date = new Date()): boolean {
  return now.getTime() >= jam.startsAt.getTime();
}

export function canSubmit(phase: JamPhase): boolean {
  return phase === 'open';
}

export function canRate(phase: JamPhase): boolean {
  return phase === 'open' || phase === 'rating';
}

export type Averages = Record<JamCategory, number>;

/** Mean of the four category means (rounded to 2 dp), or 0 with no ratings. */
export function overall(avg: Averages | null): number {
  if (!avg) return 0;
  const sum = JAM_CATEGORIES.reduce((s, c) => s + avg[c], 0);
  return Math.round((sum / JAM_CATEGORIES.length) * 100) / 100;
}
