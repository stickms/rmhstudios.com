/**
 * Roommate compatibility (F9) — pure, client-safe and zod-free (the PUT schema
 * is `./roommate-schema`).
 *
 * Five lifestyle answers per member. Compatibility is a weighted average of how
 * close the two members' answers are: 1 for identical, 0 for the far ends of a
 * 1–5 scale. Pets are a choice rather than a scale — the only clash is
 * "I have pets" against "no pets please". Only the resulting percentage is ever
 * shown to anyone; the answers themselves stay private to each member.
 */

import type { RoommateProfile } from './roommate-schema';

export type { RoommateProfile };

export const SCALE_KEYS = ['sleep', 'guests', 'cleanliness', 'noise'] as const;
export type ScaleKey = (typeof SCALE_KEYS)[number];
export const PET_CHOICES = ['has', 'fine', 'no'] as const;
export type PetChoice = (typeof PET_CHOICES)[number];

const WEIGHTS = { sleep: 0.2, guests: 0.2, cleanliness: 0.25, noise: 0.2, pets: 0.15 } as const;

export function compatibility(a: RoommateProfile, b: RoommateProfile): number {
  let score = 0;
  for (const k of SCALE_KEYS) score += WEIGHTS[k] * (1 - Math.abs(a[k] - b[k]) / 4);
  const petClash = (a.pets === 'has' && b.pets === 'no') || (a.pets === 'no' && b.pets === 'has');
  score += WEIGHTS.pets * (petClash ? 0 : 1);
  return Math.round(score * 100);
}
