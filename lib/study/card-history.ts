/**
 * One card's history, pure (s12-09): the state a member's card is in, the names of the four grades (as i18n keys the
 * dialog translates) and the cap on how many reviews one answer carries. The server reads the rows; this file only
 * decides what they mean.
 */

/** The most reviews one answer lists, newest first. */
export const HISTORY_LIMIT = 100;

export const GRADE_KEYS = ['again', 'hard', 'good', 'easy'] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];

/** The name of a grade (0 to 3), or null for a number that is none. */
export function gradeKey(grade: number): GradeKey | null {
  return Number.isInteger(grade) && grade >= 0 && grade < GRADE_KEYS.length ? (GRADE_KEYS[grade] ?? null) : null;
}

export const CARD_STATES = ['new', 'learning', 'review', 'suspended', 'leech'] as const;
export type CardState = (typeof CARD_STATES)[number];

export interface CardStateInput {
  /** The member's schedule row for the card; null while the card has never been reviewed. */
  review: { repetitions: number; suspendedAt: Date | null; suspendReason: string | null } | null;
  /** Whether the card was reviewed since the member last started it over (or ever, when they never did). */
  reviewedSinceReset: boolean;
}

/**
 * New (never reviewed, or started over and not yet reviewed), learning (reviewed but not yet passed, so it is
 * being learned again), review (passed at least once in a row), suspended (set aside by the member) or leech
 * (set aside after too many lapses).
 */
export function cardState({ review, reviewedSinceReset }: CardStateInput): CardState {
  if (!review) return 'new';
  if (review.suspendedAt) return review.suspendReason === 'leech' ? 'leech' : 'suspended';
  if (review.repetitions > 0) return 'review';
  return reviewedSinceReset ? 'learning' : 'new';
}

/** The schedule a card starts over with: what a never-reviewed card has, due now. */
export const FRESH_SCHEDULE = { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 } as const;

/** What the history answer says about a card that has no schedule row. */
export function emptyHistory(): { dueAt: null; intervalDays: number; easeFactor: number; lapses: number } {
  return { dueAt: null, intervalDays: 0, easeFactor: FRESH_SCHEDULE.easeFactor, lapses: 0 };
}
