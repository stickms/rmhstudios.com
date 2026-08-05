/**
 * Account deletion grace period (B12).
 *
 * `POST /api/account/delete` is immediate and irreversible: it destroys every
 * credential and anonymizes the profile in one transaction. That is the correct
 * *end state* and the wrong *timing*. Deletions are overwhelmingly made in a bad
 * moment — after an argument, a ban, a bad week — and the person who regrets it
 * six hours later has nothing to come back to. GDPR asks for erasure on request,
 * not erasure within the second; a documented 30-day window with the account
 * fully signed out and hidden satisfies it and is what every mature platform
 * ships.
 *
 * So deletion becomes two phases:
 *
 *   1. **Schedule** (`scheduleDeletion`) — `user.deletionScheduledAt` is set 30
 *      days out. The caller still tears down credentials and hides the account,
 *      so from the outside it is gone the moment the button is pressed.
 *   2. **Finalize** (`finalizeDueDeletions`) — a nightly sweep runs the SAME
 *      anonymisation the immediate path runs. There is exactly one definition of
 *      "erased" (`lib/account-lifecycle.ts` markers + the scrub below) because
 *      two definitions is how one of them ends up leaving PII behind.
 *
 * **Signing back in cancels.** That is the recovery path, and it is deliberately
 * the *only* one a user needs to discover — a cancellation link in an email
 * expires, gets lost, or lands in spam, while "log in again" is what a person
 * tries unprompted. See {@link cancelDeletion} for the call site.
 */

import { prisma } from '@/lib/prisma.server';
import {
  DELETED_ACCOUNT_BAN_REASON,
  DELETED_ACCOUNT_LOCK_UNTIL,
  isDeletedAccount,
} from '@/lib/account-lifecycle';

/**
 * How long a scheduled deletion can be undone. 30 days is the window the major
 * platforms use, which matters more than the exact number: it is the period
 * users already expect, so nobody has to read the fine print to know they have
 * time.
 */
export const DELETION_GRACE_DAYS = 30;
const DELETION_GRACE_MS = DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Mark an account for deletion and return the date it becomes irreversible.
 *
 * Idempotent by design: calling it twice does NOT push the date out. A user who
 * hits the button again a week later means "yes, still delete it", not "give me
 * another 30 days" — and re-arming the clock on every call would let a stuck
 * client keep an account alive forever.
 */
export async function scheduleDeletion(userId: string, now: Date = new Date()): Promise<Date> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletionScheduledAt: true },
  });
  if (existing?.deletionScheduledAt) return existing.deletionScheduledAt;

  const scheduledAt = new Date(now.getTime() + DELETION_GRACE_MS);
  await prisma.user.update({
    where: { id: userId },
    data: { deletionScheduledAt: scheduledAt },
  });
  return scheduledAt;
}

/**
 * Clear a pending deletion.
 *
 * **Call site:** the sign-in path. Better Auth's
 * `databaseHooks.session.create.after` (the same seam
 * `lib/auth/session-alert.server.ts` uses) is the right place —
 * `void cancelDeletion(session.userId)` — because it fires for every way back
 * in: password, OAuth, passkey. Putting it on a "restore my account" button
 * instead means the user has to find the button.
 *
 * Returns true when a pending deletion was actually cleared, so the caller can
 * show "welcome back — your deletion was cancelled" only when it happened.
 * A row already anonymised is never resurrected: `isDeletedAccount` is the
 * guard, and an anonymised account has no credentials to sign in with anyway.
 */
export async function cancelDeletion(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletionScheduledAt: true, banReason: true },
  });
  if (!user?.deletionScheduledAt) return false;
  if (isDeletedAccount(user)) return false;

  await prisma.user.update({ where: { id: userId }, data: { deletionScheduledAt: null } });
  return true;
}

/** Whether an account is inside its grace window (for the "pending deletion"
 *  banner and for gating writes the user would lose anyway). */
export function isPendingDeletion(
  user: { deletionScheduledAt: Date | null; banReason?: string | null },
  now: Date = new Date(),
): boolean {
  if (!user.deletionScheduledAt) return false;
  if (isDeletedAccount(user)) return false;
  return user.deletionScheduledAt.getTime() > now.getTime();
}

/* -------------------------------------------------------------------------- */
/* Finalization                                                                */
/* -------------------------------------------------------------------------- */

export interface FinalizeResult {
  /** Accounts whose grace window had expired. */
  due: number;
  /** Accounts actually anonymised this run. */
  finalized: number;
}

/**
 * Anonymise every account whose grace window has expired.
 *
 * **Call site:** a scheduled worker (the web tier runs no cron — see
 * `lib/CLAUDE.md`). `server/jobs` (pg-boss) is the natural home, on a daily
 * schedule. Deliberately batched and resumable: the sweep is bounded by `limit`,
 * and because finalisation clears `deletionScheduledAt` a re-run picks up
 * exactly what it did not finish.
 */
export async function finalizeDueDeletions(
  opts: { limit?: number; now?: Date } = {},
): Promise<FinalizeResult> {
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);

  const due = await prisma.user.findMany({
    where: {
      deletionScheduledAt: { not: null, lte: now },
      // Already-tombstoned rows would otherwise be re-scrubbed on every sweep.
      banReason: { not: DELETED_ACCOUNT_BAN_REASON },
    },
    select: { id: true },
    orderBy: { deletionScheduledAt: 'asc' },
    take: limit,
  });

  let finalized = 0;
  for (const { id } of due) {
    try {
      await anonymizeAccount(id);
      finalized += 1;
    } catch (err) {
      // One bad row must not abort the sweep — the next run retries it, because
      // a failed finalisation leaves `deletionScheduledAt` set.
      console.error(`[account] finalize failed for ${id}:`, err);
    }
  }

  return { due: due.length, finalized };
}

/**
 * The erasure itself — the anonymize-in-place path from
 * `app/routes/api/account/delete.ts`, reused rather than reimplemented.
 *
 * The user row is NOT dropped: foreign keys from ~250 models point at it, so a
 * hard delete either fails or cascades away other people's content (their
 * replies, their match histories). Instead the row becomes a tombstone —
 * `DELETED_ACCOUNT_BAN_REASON` + `DELETED_ACCOUNT_LOCK_UNTIL` from
 * `lib/account-lifecycle.ts` are the contract other sweeps read to know this is
 * a marker and not a person.
 *
 * Exported so the immediate route and the sweep can converge on one
 * implementation. Note the deliberate omission: object-storage cleanup (résumé
 * files) stays in the HTTP route, which already deletes those objects before it
 * schedules — doing storage I/O inside a batch sweep would make one unreachable
 * bucket stall every pending deletion behind it.
 */
export async function anonymizeAccount(userId: string): Promise<void> {
  await prisma.$transaction([
    // 1. Destroy every way to authenticate as this account. Re-run safe: by the
    //    time the sweep fires these are usually already gone (the schedule step
    //    signs the user out), and deleteMany on an empty set is a no-op.
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.passkey.deleteMany({ where: { userId } }),
    prisma.pushSubscription.deleteMany({ where: { userId } }),
    // 2. Private RMHLadder data (résumés, applications, salary/EEO answers).
    //    `ladderAnswerBank` has an onDelete: Cascade relation that never fires,
    //    because step 3 anonymises the user row instead of removing it.
    prisma.ladderAlertEvent.deleteMany({ where: { userId } }),
    prisma.ladderAlert.deleteMany({ where: { userId } }),
    prisma.ladderProductEvent.deleteMany({ where: { userId } }),
    prisma.ladderSavedSearch.deleteMany({ where: { userId } }),
    prisma.ladderApplication.deleteMany({ where: { userId } }),
    prisma.ladderJobAction.deleteMany({ where: { userId } }),
    prisma.ladderWatchlistEntry.deleteMany({ where: { userId } }),
    prisma.ladderKeyword.deleteMany({ where: { userId } }),
    prisma.ladderUserPrefs.deleteMany({ where: { userId } }),
    prisma.ladderAnswerBank.deleteMany({ where: { userId } }),
    prisma.ladderResume.deleteMany({ where: { userId } }),
    // 3. Scrub PII from the profile.
    prisma.userProfile.updateMany({
      where: { userId },
      data: {
        displayName: null,
        bio: null,
        location: null,
        website: null,
        customImage: null,
        profileSongTitle: null,
        profileSongArtist: null,
        profileSongSpotifyId: null,
        profileSongPreviewUrl: null,
        profileSongAlbumArt: null,
      },
    }),
    // 4. Anonymize + lock the user record, and clear the schedule so the sweep
    //    does not consider this row again.
    prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Deleted user',
        email: null,
        emailVerified: false,
        username: null,
        handle: null,
        image: null,
        password: null,
        referralCode: null,
        botPersona: null,
        bannedUntil: DELETED_ACCOUNT_LOCK_UNTIL,
        banReason: DELETED_ACCOUNT_BAN_REASON,
        deletionScheduledAt: null,
      },
    }),
  ]);
}
