/**
 * Account deletions for admins (pure): the row shapes /admin/deletions shows and the rule that decides when a
 * scheduled deletion counts as overdue. No database, no zod, so the page and the tests share it.
 *
 * Nothing here carries an e-mail address, an error message or a stack: a row has the member's id and handle, dates,
 * counts of what the deletion hold paused, and the last attempt's error NAME (a class or Prisma code).
 */

/** A scheduled deletion is overdue once it fell due more than this long ago and is still not finished. */
export const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;
/** The Finished section covers this many days. */
export const FINISHED_DAYS = 30;
/** Rows one section lists at most (the section's own count is always exact). */
export const DELETIONS_LIST_LIMIT = 200;

/** Whether a deletion due at `dueAt` is overdue at `now`. */
export function isOverdue(dueAt: Date | null, now: Date): boolean {
  if (!dueAt) return false;
  return now.getTime() - dueAt.getTime() > OVERDUE_AFTER_MS;
}

/** What the deletion hold paused for one account. */
export interface HoldCounts {
  keys: number;
  webhooks: number;
  subscriptions: number;
}

export const NO_HOLD: HoldCounts = { keys: 0, webhooks: 0, subscriptions: 0 };

export interface WaitingDeletionRow {
  userId: string;
  handle: string | null;
  requestedAt: string;
  dueAt: string;
  held: HoldCounts;
}

export interface OverdueDeletionRow extends WaitingDeletionRow {
  /** Attempts recorded for the account in the retention window. */
  attempts: number;
  /** The last attempt's error name; null when it has none (no attempt yet, or it is still running). */
  lastErrorName: string | null;
  lastAttemptAt: string | null;
  /** An attempt is running now (unfinished and inside the claim window): "Try again now" would be refused. */
  running: boolean;
}

export interface FinishedDay {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  count: number;
}

export interface AdminDeletions {
  waiting: WaitingDeletionRow[];
  waitingTotal: number;
  overdue: OverdueDeletionRow[];
  overdueTotal: number;
  /** One entry per day for the last {@link FINISHED_DAYS} days, oldest first, zeros included. */
  finished: FinishedDay[];
  finishedTotal: number;
}

/** The answer to "Try again now": whether the erasure finished and, if it threw, the error's name. */
export interface RetryErasureResult {
  erased: boolean;
  errorName: string | null;
}

/** The error's class or Prisma code, never its message (a message can carry the data that made it fail). */
export function erasureErrorName(err: unknown): string {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && /^P\d{4}$/.test(code)) return code;
  const name =
    err instanceof Error ? err.name : typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : null;
  const clean = typeof name === 'string' ? name.replace(/[^A-Za-z0-9_.$-]/g, '') : '';
  return (clean || 'Error').slice(0, 120);
}
