/**
 * Removals after a report and the second look a member may ask for (sprint 15, feature 16). Client-safe: plain data and
 * pure functions; the database half is `removal-reviews.server.ts`.
 *
 * A report takedown of a member's item is recorded (`ContentRemoval`) so its author is told and can see it in the
 * Account status section of `/settings/security`. A removal whose takedown is a `moderatedAt` stamp can be undone, and
 * the author may ask a moderator to look again, once, within {@link REMOVAL_REVIEW_WINDOW_DAYS} days.
 */

/**
 * The types whose takedown only stamps `moderatedAt` (and set the item's own visibility switch off), so a restore is
 * possible. Not `tube-room` (the room was closed and its members told; clearing the stamp would not reopen it) and not
 * the hiding types (`lights-out-board`, `connections-grid`, `studio-share`, `webring`, `stamp`), whose takedowns are
 * not a `moderatedAt` stamp. A post, a reply, a message or a song is deleted and cannot come back.
 */
export const REVERSIBLE_REMOVAL_TYPES = [
  'study-deck',
  'persona',
  'home-listing',
  'rmhbox-pack',
  'game-review',
  'game-guide',
  'achievement-tip',
  'tf2-hud',
  'tf2-loadout',
  'versecraft-seed',
] as const;

export type ReversibleRemovalType = (typeof REVERSIBLE_REMOVAL_TYPES)[number];

/**
 * The reversible types whose owner holds a visibility switch the takedown turned off (a deck and a persona private, a
 * pack hidden, a listing removed, a HUD and a loadout private). A restore leaves it off, so the owner publishes again;
 * the others (a review, a guide, a tip, a story listing) come back where they were.
 */
const RESTORE_LEAVES_OFF: ReadonlySet<string> = new Set<ReversibleRemovalType>([
  'study-deck',
  'persona',
  'home-listing',
  'rmhbox-pack',
  'tf2-hud',
  'tf2-loadout',
]);

/** Whether a restored item of this type waits for its owner to publish it again. */
export function restoreLeavesItemOff(type: string): boolean {
  return RESTORE_LEAVES_OFF.has(type);
}

export function isReversibleRemovalType(type: string): type is ReversibleRemovalType {
  return (REVERSIBLE_REMOVAL_TYPES as readonly string[]).includes(type);
}

/** A removal can be contested this soon after it happened. */
export const REMOVAL_REVIEW_WINDOW_DAYS = 14;
export const REMOVAL_REVIEW_WINDOW_MS = REMOVAL_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** The longest note a member may add to a request. */
export const REMOVAL_REVIEW_NOTE_MAX = 500;

/** What an admin may decide. */
export type RemovalReviewAction = 'uphold' | 'restore';
export type RemovalReviewOutcome = 'upheld' | 'restored';

/** Where a removal stands, as its author reads it. */
export type RemovalState = 'removed' | 'asked' | 'upheld' | 'restored';

export interface RemovalStateInput {
  reversible: boolean;
  removedAt: Date;
  reviewRequestedAt: Date | null;
  reviewDecidedAt: Date | null;
  reviewOutcome: string | null;
}

export function removalState(row: RemovalStateInput): RemovalState {
  if (row.reviewDecidedAt) return row.reviewOutcome === 'restored' ? 'restored' : 'upheld';
  if (row.reviewRequestedAt) return 'asked';
  return 'removed';
}

/** The earliest `removedAt` that may still be contested at `now`. */
export function reviewCutoff(now: Date): Date {
  return new Date(now.getTime() - REMOVAL_REVIEW_WINDOW_MS);
}

/** Whether the author may still ask: reversible, never asked, and inside the window. */
export function canAskForReview(row: RemovalStateInput, now: Date): boolean {
  return row.reversible && !row.reviewRequestedAt && row.removedAt.getTime() >= reviewCutoff(now).getTime();
}
