/**
 * Poll lifecycle (sprint 04 #08) — the pure rules, shared by the server and the client.
 *
 * A poll ends when its author ends it (`closedAt`) or when its `closesAt` passes. The effective end is
 * `closedAt ?? closesAt`; every serialiser, the vote route, the extend route and the notice job read it through
 * this file, so no path can show a poll as open that another path has closed.
 */

/** A poll can run for this many days from the post, however often it is extended (the composer's own maximum). */
export const POLL_MAX_DAYS = 30;

/** The extensions an author can pick. */
export const POLL_EXTEND_DAYS =
  [
    1,
    3,
    7,
  ] as const;
export type PollExtendDays =
  (typeof POLL_EXTEND_DAYS)[number];

/** Above this many votes only the author hears the result (a pile-on guard). */
export const POLL_VOTER_NOTICE_MAX_VOTES = 2000;

/** Most polls one run of the notice job claims; the next minute's run takes the rest. */
export const POLL_NOTICE_BATCH = 200;

/** Voter ids are read this many at a time. */
export const POLL_VOTER_PAGE = 500;

const DAY_MS = 86_400_000;

export interface PollTimes {
  closesAt: Date | null;
  closedAt: Date | null;
}

/** When the poll stopped or will stop taking votes; null for an open poll with no end. */
export function pollEffectiveEnd(
  poll: PollTimes,
): Date | null {
  return (
    poll.closedAt ??
    poll.closesAt
  );
}

export function isPollEnded(
  poll: PollTimes,
  now: Date = new Date(),
): boolean {
  const end =
    pollEffectiveEnd(
      poll,
    );
  return (
    end !==
      null &&
    end.getTime() <=
      now.getTime()
  );
}

/** The latest a poll created at `createdAt` may end. */
export function pollLatestEnd(
  createdAt: Date,
): Date {
  return new Date(
    createdAt.getTime() +
      POLL_MAX_DAYS *
        DAY_MS,
  );
}

/** Where a timed poll that closes at `closesAt` would close if extended by `days`. */
export function extendedEnd(
  closesAt: Date,
  days: number,
): Date {
  return new Date(
    closesAt.getTime() +
      days *
        DAY_MS,
  );
}

/**
 * The extensions an author can still pick: none for an ended poll or one with no end, and only those that leave the
 * poll's end within 30 days of its creation.
 */
export function allowedExtensions(
  poll: PollTimes & {
    createdAt: Date;
  },
  now: Date = new Date(),
): PollExtendDays[] {
  if (
    poll.closesAt ===
      null ||
    isPollEnded(
      poll,
      now,
    )
  )
    return [];
  const latest =
    pollLatestEnd(
      poll.createdAt,
    ).getTime();
  const closesAt =
    poll.closesAt;
  return POLL_EXTEND_DAYS.filter(
    (
      days,
    ) =>
      extendedEnd(
        closesAt,
        days,
      ).getTime() <=
      latest,
  );
}

/** What every poll serialiser adds to a poll: its effective end and whether it is over. */
export interface PollLifecycleView {
  /** The effective end (ISO), or null for an open poll with no end. */
  closesAt:
    | string
    | null;
  ended: boolean;
  /** The author extended the poll at least once. */
  extended: boolean;
  /** The extensions still open to the author; empty when ended or untimed. */
  extendDays: number[];
}

export function pollLifecycleView(
  poll: PollTimes & {
    createdAt: Date;
    extendedAt: Date | null;
  },
  now: Date = new Date(),
): PollLifecycleView {
  const end =
    pollEffectiveEnd(
      poll,
    );
  return {
    closesAt:
      end
        ? end.toISOString()
        : null,
    ended:
      isPollEnded(
        poll,
        now,
      ),
    extended:
      poll.extendedAt !==
      null,
    extendDays:
      allowedExtensions(
        poll,
        now,
      ),
  };
}

export interface TalliedOption {
  id: string;
  text: string;
  voteCount: number;
}

/** The share of `total` as a whole percent, the way the poll rows draw it. */
export function votePercent(
  voteCount: number,
  total: number,
): number {
  return total >
    0
    ? Math.round(
        (voteCount /
          total) *
          100,
      )
    : 0;
}

export function totalVotesOf(
  options: readonly TalliedOption[],
): number {
  return options.reduce(
    (
      sum,
      o,
    ) =>
      sum +
      o.voteCount,
    0,
  );
}

/** The option or options with the most votes; every tied option, and none when nobody voted. */
export function pollWinners<
  T extends
    TalliedOption,
>(
  options: readonly T[],
): T[] {
  const top =
    options.reduce(
      (
        max,
        o,
      ) =>
        Math.max(
          max,
          o.voteCount,
        ),
      0,
    );
  return top >
    0
    ? options.filter(
        (
          o,
        ) =>
          o.voteCount ===
          top,
      )
    : [];
}

/** Voters hear the result only for polls small enough that a notice to each is not a pile-on. */
export function votersAreNotified(
  totalVotes: number,
): boolean {
  return (
    totalVotes <=
    POLL_VOTER_NOTICE_MAX_VOTES
  );
}

const NAME_MAX = 60;

function names(
  options: readonly TalliedOption[],
): string {
  const clipped =
    options.map(
      (
        o,
      ) =>
        o
          .text
          .length >
        NAME_MAX
          ? `${o.text.slice(0, NAME_MAX - 1)}…`
          : o.text,
    );
  return new Intl.ListFormat(
    'en',
    {
      style:
        'long',
      type: 'conjunction',
    },
  ).format(
    clipped,
  );
}

/** The author's notice: the winner and its share, every tied option, or that nobody voted. */
export function authorNoticeText(
  options: readonly TalliedOption[],
): string {
  const winners =
    pollWinners(
      options,
    );
  const [
    first,
  ] =
    winners;
  if (
    !first
  )
    return 'Your poll ended with no votes';
  const pct =
    votePercent(
      first.voteCount,
      totalVotesOf(
        options,
      ),
    );
  return winners.length ===
    1
    ? `Your poll ended: ${names(winners)} won with ${pct}%`
    : `Your poll ended in a tie: ${names(winners)} with ${pct}% each`;
}

export const VOTER_NOTICE_TEXT =
  'A poll you voted in ended';
