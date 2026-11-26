/**
 * Timed account mutes (s10-10). A `UserMute` row may carry `expiresAt`; a row whose `expiresAt` is past is absent for
 * every reader, whether or not the daily clean-up has deleted it yet. Pure: shared by the readers, the endpoint, the
 * job and the tests. The durations are the muted-words ones (`MUTE_DURATIONS`), so both mute kinds offer the same
 * choices.
 */
import { MAX_MUTE_MS, MUTE_DURATIONS, type MuteDuration } from '@/lib/feed/muted-expiry';

/** "Until I unmute" is today's behaviour: no `expiresAt`. */
export const ACCOUNT_MUTE_DURATIONS = ['day', 'week', 'month', 'forever'] as const;
export type AccountMuteDuration = (typeof ACCOUNT_MUTE_DURATIONS)[number];

export function isAccountMuteDuration(value: unknown): value is AccountMuteDuration {
  return typeof value === 'string' && (ACCOUNT_MUTE_DURATIONS as readonly string[]).includes(value);
}

/**
 * The instant a mute made at `now` ends, or null for "until I unmute". Always computed on the server from its own
 * clock, never from a client-supplied time.
 */
export function muteExpiresAt(duration: AccountMuteDuration, now: Date): Date | null {
  if (duration === 'forever') return null;
  return new Date(now.getTime() + Math.min(MUTE_DURATIONS[duration as MuteDuration], MAX_MUTE_MS));
}

/** A row is in force when it has no end or its end is still ahead. */
export function isMuteActive(expiresAt: Date | null | undefined, now: Date): boolean {
  return expiresAt == null || expiresAt.getTime() > now.getTime();
}

/**
 * The one filter every reader of `UserMute` applies (Prisma where-shaped). It is an `OR`, so a reader that already
 * has its own `OR` combines it with `AND: [activeMuteWhere(now)]`.
 */
export function activeMuteWhere(now: Date): { OR: ({ expiresAt: null } | { expiresAt: { gt: Date } })[] } {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

/**
 * Every server module that reads `userMute` to decide what a member sees or gets. A source scan
 * (`lib/moderation/__tests__/mute-read-paths.test.ts`) holds that each uses `activeMuteWhere`, and that no other
 * file reads `userMute` unless it is in {@link MUTE_EXEMPT_PATHS} with a reason.
 */
export const MUTE_READ_PATHS: readonly string[] = [
  // The helper most feed readers call (hidden authors, cached ~30s).
  'lib/moderation.server.ts',
  // The "Blocked and muted" settings list and its counts.
  'lib/moderation/blocked-muted.server.ts',
  // Who is notified about a followed account's activity.
  'lib/discovery/watch.server.ts',
  // The admin "view as member" snapshot of a member's mutes.
  'lib/safety/view-as.server.ts',
  // Community post alerts skip members who muted the author.
  'lib/communities/post-alerts.server.ts',
  // The away message is not sent across a mute.
  'lib/messages/away.server.ts',
  // Poll-ending notices skip voters who muted the author.
  'lib/feed/poll-lifecycle.server.ts',

  // Sprint 14
  // s14-09 profile-reports
  // The profile header: whether the viewer has muted this account, so the profile menu offers Unmute.
  'lib/profile.server.ts',

  // s14-11 thread-replies
  // A game thread's reply notices skip members who muted the poster.
  'lib/games/thread-notices.server.ts',

  // Sprint 15
  // s15-05 prediction-comments
  // No entry: a market's discussion (`listComments`, lib/forecasting/forecasting.server.ts) never reads `userMute`;
  // it takes its hidden set from `getHiddenAuthorIds`, so `lib/moderation.server.ts` above is the path that applies
  // the predicate for it. Listing the caller would fail the registry's scan, which holds that each entry reads the table.

  // s15-06 member-text-reports
  // No entry: the announcement discussion (`GET /api/blog/$slug/comments`, lib/blog/api/blog.$slug.comments.server.ts)
  // and the report eligibility check (lib/moderation/member-text-reports.server.ts) never read `userMute`; they take
  // their hidden set from `getHiddenAuthorIds`, so `lib/moderation.server.ts` above is the path that applies the
  // predicate for them. Listing the callers would fail the registry's scan, which holds that each entry reads the table.

  // s15-12 thread-mentions
  // No entry: `notifyThreadMentions` (lib/games/thread-mentions.server.ts) never reads `userMute`; it takes its reachable
  // members from `reachableRecipients`, so 'lib/games/thread-notices.server.ts' above is the path that applies the
  // predicate for it. Listing the caller would fail the registry's scan, which holds that each entry reads the table.
];

/** Files that touch `userMute` without being a reader that filters, each with the reason. */
export const MUTE_EXEMPT_PATHS: Readonly<Record<string, string>> = {
  'lib/moderation/mute-expiry-jobs.server.ts':
    'The daily clean-up deletes rows whose end has passed; it filters on the expiry itself, which is the opposite of a reader.',
  'lib/moderation/mute-expiry.ts': 'Defines the predicate (and names the table in prose); it reads nothing.',
  'lib/moderation/api/moderation.mute.server.ts':
    "The toggle endpoint writes the table; it reads only the caller's own row to change it, and treats an expired row as absent itself.",
  'lib/account/api/account.export.server.ts':
    "The account export lists the member's own rows with every column, expiresAt included, expired ones until the job removes them.",
};
