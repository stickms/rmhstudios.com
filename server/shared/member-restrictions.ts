/**
 * s14-17: a moderator's timeout, asked by a socket hub.
 *
 * The hubs hold their own Prisma client and never import the web tier, so they read a timeout through
 * `isRestrictedIn` (`lib/moderation/restrictions-core.ts`) with that client. A read that fails, or takes longer than
 * `READ_TIMEOUT_MS`, lets the line through and says so in the log: chat is realtime, a database outage must not
 * take every room's chat down with it, and the web tier's writers still enforce the timeout. The failure is bounded:
 * after one, this process skips the read (and lets lines through) for `FAIL_OPEN_BACKOFF_MS`, so an outage costs
 * one slow read and one log line per window, not one per chat line.
 */
import { isRestrictedIn, type RestrictionDb } from '../../lib/moderation/restrictions-core';
import { refusalBody } from '../../lib/errors/codes';

/** The longest a chat line waits for the timeout read. */
export const READ_TIMEOUT_MS = 1_500;
/** After a failed read, how long this process lets lines through without asking again. */
export const FAIL_OPEN_BACKOFF_MS = 5_000;

let failOpenUntil = 0;

/** Forget a recorded failure (tests). */
export function resetRestrictionFailOpen(): void {
  failOpenUntil = 0;
}

/** The one event body every hub sends a member whose chat line was refused for a timeout. */
export function restrictedChatError(): { code: 'FEATURE_RESTRICTED'; message: string } {
  return { code: 'FEATURE_RESTRICTED', message: refusalBody('FEATURE_RESTRICTED').error };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`restriction read timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Whether `userId` is timed out of `feature` (30-second cache per process); false when the read fails or times
 * out, and for `FAIL_OPEN_BACKOFF_MS` after that. `onError` is called once per failure, not once per line.
 */
export async function isMemberRestricted(
  db: RestrictionDb,
  userId: string,
  feature: 'message' | 'comment' | 'post',
  onError: (err: unknown) => void,
): Promise<boolean> {
  if (Date.now() < failOpenUntil) return false;
  try {
    return await withTimeout(isRestrictedIn(db, userId, feature), READ_TIMEOUT_MS);
  } catch (err) {
    failOpenUntil = Date.now() + FAIL_OPEN_BACKOFF_MS;
    onError(err);
    return false;
  }
}
