/**
 * Study queue rules, pure: the lapse and leech thresholds, the session caps and the registry of every server
 * path that counts or queues due cards. Suspension is per member, on the member's `FlashcardReview` row.
 */

/** Grades of "Again" on a learned card that set it aside as a leech. */
export const LEECH_THRESHOLD = 8;
/** Lapses a card is given back when a member unsuspends a leech: four more tries. */
export const LEECH_RESET = 4;
/** Never-reviewed cards from the member's own decks that one session adds. */
export const NEW_PER_SESSION = 20;
/** Cards in one session; "Keep going" fetches the next batch. */
export const SESSION_MAX = 200;

export const SUSPEND_REASONS =
  [
    'manual',
    'leech',
  ] as const;
export type SuspendReason =
  (typeof SUSPEND_REASONS)[number];

export function isSuspendReason(
  v: unknown,
): v is SuspendReason {
  return (
    v ===
      'manual' ||
    v ===
      'leech'
  );
}

/** A lapse is an "Again" (grade 0) on a card that had been learned (`repetitions > 0`). */
export function isLapse(
  grade: number,
  repetitions: number,
): boolean {
  return (
    grade ===
      0 &&
    repetitions >
      0
  );
}

/** True once a card has missed enough reviews to be set aside. */
export function isLeech(
  lapses: number,
): boolean {
  return (
    lapses >=
    LEECH_THRESHOLD
  );
}

/** What unsuspending does to the lapse counter: a leech gets `LEECH_RESET`, a manual suspension keeps it. */
export function lapsesAfterUnsuspend(
  reason:
    | string
    | null,
  lapses: number,
): number {
  return reason ===
    'leech'
    ? Math.min(
        lapses,
        LEECH_RESET,
      )
    : lapses;
}

/** A queue card as the review screen reads it. */
export interface QueueCard {
  id: string;
  front: string;
  back: string;
  kind:
    | 'basic'
    | 'reversible'
    | 'cloze';
  clozeIndex:
    | number
    | null;
  sourceId:
    | string
    | null;
  deckId: string;
  deckTitle: string;
}

/**
 * Every server file that counts or queues due cards. Each one must apply `ACTIVE_REVIEW_WHERE`
 * (`lib/study/card-query.server.ts`), or, for a raw count, `"suspendedAt" IS NULL`;
 * `lib/study/__tests__/due-count-read-paths.test.ts` scans them.
 */
export const DUE_COUNT_READ_PATHS =
  [
    'lib/study/queue.server.ts',
    'lib/study/api/study.decks.$id.review.server.ts',
    'lib/study.server.ts',
    'lib/study/stats.server.ts',
    'lib/study/reminders.server.ts',
    'lib/api/v1/study.server.ts',
    'lib/history/resume.server.ts',
  ] as const;
