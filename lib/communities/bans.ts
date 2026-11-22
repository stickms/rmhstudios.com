/**
 * Community bans and timeouts (s06-01), pure part: the closed lists of kinds and
 * durations, `endsAtFor`, `isActive`, the notice text and `BAN_ENFORCEMENT_PATHS`.
 * Nothing here touches a database; `bans.server.ts` does.
 *
 * A ban keeps a member out (join, invite, join request, post, comment); a timeout
 * keeps them in but unable to post or comment until it ends. Expiry is read-time.
 */

export const SANCTION_KINDS =
  [
    'ban',
    'timeout',
  ] as const;
export type SanctionKind =
  (typeof SANCTION_KINDS)[number];

export const TIMEOUT_DURATIONS =
  [
    '1h',
    '1d',
    '3d',
    '7d',
  ] as const;
export const BAN_DURATIONS =
  [
    '1d',
    '7d',
    '30d',
    'forever',
  ] as const;
export type TimeoutDuration =
  (typeof TIMEOUT_DURATIONS)[number];
export type BanDuration =
  (typeof BAN_DURATIONS)[number];
export type SanctionDuration =
  | TimeoutDuration
  | BanDuration;

/** Every duration, for the zod enum (the API never takes free minutes). */
export const SANCTION_DURATIONS =
  [
    '1h',
    '1d',
    '3d',
    '7d',
    '30d',
    'forever',
  ] as const;

export const SANCTION_REASON_MAX = 300;
/** The "lifted or expired" segment shows this many rows. */
export const PAST_SANCTIONS_LIMIT = 100;

const HOUR_MS = 3_600_000;
const DURATION_MS: Record<
  Exclude<
    SanctionDuration,
    'forever'
  >,
  number
> = {
  '1h': HOUR_MS,
  '1d':
    24 *
    HOUR_MS,
  '3d':
    72 *
    HOUR_MS,
  '7d':
    168 *
    HOUR_MS,
  '30d':
    720 *
    HOUR_MS,
};

/** The durations a kind accepts. */
export function durationsFor(
  kind: SanctionKind,
): readonly SanctionDuration[] {
  return kind ===
    'ban'
    ? BAN_DURATIONS
    : TIMEOUT_DURATIONS;
}

export function isDurationAllowed(
  kind: SanctionKind,
  duration: SanctionDuration,
): boolean {
  return (
    durationsFor(
      kind,
    ) as readonly string[]
  ).includes(
    duration,
  );
}

/** When a sanction starting at `now` ends; `null` = until a moderator lifts it. */
export function endsAtFor(
  duration: SanctionDuration,
  now: Date,
): Date | null {
  if (
    duration ===
    'forever'
  )
    return null;
  return new Date(
    now.getTime() +
      DURATION_MS[
        duration
      ],
  );
}

/** The columns `isActive` reads. */
export interface SanctionWindow {
  endsAt: Date | null;
  liftedAt: Date | null;
}

/** Active = not lifted and not yet ended. `endsAt === now` is already over. */
export function isActive(
  row: SanctionWindow,
  now: Date,
): boolean {
  if (
    row.liftedAt
  )
    return false;
  return (
    row.endsAt ===
      null ||
    row.endsAt.getTime() >
      now.getTime()
  );
}

/**
 * Every server path that must refuse a sanctioned member, each reading
 * `activeSanction`. `ban-enforcement-paths.test.ts` holds this list against the
 * source: a new place members join or write in a community is added here.
 */
export const BAN_ENFORCEMENT_PATHS =
  [
    'lib/communities/api/communities.$slug.join.server.ts',
    'lib/communities/invites.server.ts',
    'lib/communities/api/communities.$slug.join-request.server.ts',
    'lib/communities/gate.server.ts',
    // the shared create check the site and POST /api/v1/posts both call (explicit ban/timeout refusal before the gate)
    'lib/communities/post-gate.server.ts',
    'app/routes/api/v1/posts/$id/comments.ts',
    'lib/communities/join-requests.server.ts',
    'lib/scheduled/publish.server.ts',
    'lib/scheduled/api/scheduled.server.ts',
    // RSVPs to a community's events: the site route and PUT /api/v1/events/{id}/rsvp both call `rsvp` (s07-10)
    'lib/events.server.ts',
  ] as const;

const NOTICE_DATE: Intl.DateTimeFormatOptions =
  {
    day: 'numeric',
    month:
      'short',
    year: 'numeric',
    hour: '2-digit',
    minute:
      '2-digit',
    timeZone:
      'UTC',
    timeZoneName:
      'short',
  };

/** A fixed English "1 Dec 2026, 14:30 UTC" for server-built text (notifications, API errors). */
export function formatEnd(
  endsAt: Date,
): string {
  return new Intl.DateTimeFormat(
    'en-GB',
    NOTICE_DATE,
  ).format(
    endsAt,
  );
}

/** The error text for a refused write or join. Never contains the private reason. */
export function denyText(
  kind: SanctionKind,
  endsAt: Date | null,
): string {
  if (
    kind ===
    'timeout'
  ) {
    return endsAt
      ? `You are timed out of this community until ${formatEnd(endsAt)}. You can read but not post.`
      : 'You are timed out of this community. You can read but not post.';
  }
  return endsAt
    ? `You are banned from this community until ${formatEnd(endsAt)}.`
    : 'You are banned from this community until a moderator lifts it.';
}

export const denyCode =
  (
    kind: SanctionKind,
  ):
    | 'community_banned'
    | 'community_timed_out' =>
    kind ===
    'ban'
      ? 'community_banned'
      : 'community_timed_out';

/** The notification line to the member: kind, end and the cited rule's title, never the private reason. */
export function sanctionNoticeText(args: {
  communityName: string;
  kind: SanctionKind;
  endsAt: Date | null;
  ruleTitle?:
    | string
    | null;
}): string {
  const what =
    args.kind ===
    'ban'
      ? 'banned from'
      : 'timed out in';
  const until =
    args.endsAt
      ? `until ${formatEnd(args.endsAt)}`
      : 'until a moderator lifts it';
  const head = `You were ${what} ${args.communityName} ${until}`;
  return args.ruleTitle
    ? `${head}. Rule: ${args.ruleTitle}`
    : head;
}

export function liftedNoticeText(args: {
  communityName: string;
  kind: SanctionKind;
}): string {
  return args.kind ===
    'ban'
    ? `Your ban from ${args.communityName} was lifted`
    : `Your timeout in ${args.communityName} was lifted`;
}

/** Which notice line the community page shows (the component translates the key). */
export type StandingNoticeKey =
  | 'notice-timeout-until'
  | 'notice-timeout-open'
  | 'notice-ban-until'
  | 'notice-ban-open';

export function standingNoticeKey(
  kind: SanctionKind,
  endsAt: Date | null,
): StandingNoticeKey {
  if (
    kind ===
    'timeout'
  )
    return endsAt
      ? 'notice-timeout-until'
      : 'notice-timeout-open';
  return endsAt
    ? 'notice-ban-until'
    : 'notice-ban-open';
}

/** What the member sees about their own sanction. No reason, no moderator. */
export interface MyStandingDTO {
  kind: SanctionKind;
  endsAt:
    | string
    | null;
}

/** A sanction as a moderator sees it. `reason` is the private note. */
export interface SanctionDTO {
  id: string;
  kind: SanctionKind;
  endsAt:
    | string
    | null;
  createdAt: string;
  liftedAt:
    | string
    | null;
  reason:
    | string
    | null;
  ruleTitle:
    | string
    | null;
  member: {
    id: string;
    name:
      | string
      | null;
    handle:
      | string
      | null;
  } | null;
  moderator: {
    id: string;
    name:
      | string
      | null;
    handle:
      | string
      | null;
  } | null;
}
