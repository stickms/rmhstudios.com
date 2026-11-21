/**
 * Community post alerts — pure rules (no database, no I/O).
 *
 * A member can ask to be told about every new visible post in a community they belong to (`CommunityMember.postAlerts`).
 * The fan-out job (`post-alerts.server.ts`) reads the opted-in members in batches; these functions decide, from sets of
 * ids it has already read, who actually gets a notification, and what the notification says.
 */

export const POST_ALERT_LEVELS =
  [
    'off',
    'all',
  ] as const;
export type PostAlertLevel =
  (typeof POST_ALERT_LEVELS)[number];

export const DEFAULT_POST_ALERT_LEVEL: PostAlertLevel =
  'off';

export function isPostAlertLevel(
  value: unknown,
): value is PostAlertLevel {
  return (
    typeof value ===
      'string' &&
    (
      POST_ALERT_LEVELS as readonly string[]
    ).includes(
      value,
    )
  );
}

/** Opted-in members read per query. */
export const ALERT_BATCH_SIZE = 500;
/** Opted-in members considered per post; larger communities are what the feed is for. */
export const MAX_ALERT_RECIPIENTS = 5000;
/** An unread alert for the same community newer than this absorbs the next one. */
export const COLLAPSE_WINDOW_MS =
  30 *
  60_000;

/** The notification `entityType` (and the key of its label in `notification-labels.ts`). */
export const COMMUNITY_POST_ENTITY =
  'community_post';

/** Whether the setting should tell the member that the community is too big to be alerted for every post. */
export function isTooLargeForAlerts(
  memberCount: number,
): boolean {
  return (
    memberCount >
    MAX_ALERT_RECIPIENTS
  );
}

/** What the fan-out needs to know about one candidate member. */
export interface AlertCandidate {
  userId: string;
  /** `User.bannedUntil`. */
  bannedUntil: Date | null;
}

export interface RecipientSets {
  authorId: string;
  /** Members with a block row to or from the author (either direction). */
  blockedWithAuthor: ReadonlySet<string>;
  /** Members who muted the author. */
  mutedAuthor: ReadonlySet<string>;
  now: Date;
}

/** Whether a ban is in force at `now` (a null or past `bannedUntil` is not a ban). */
export function isBannedNow(
  bannedUntil: Date | null,
  now: Date,
): boolean {
  return (
    bannedUntil !==
      null &&
    bannedUntil.getTime() >
      now.getTime()
  );
}

/** The member ids to alert: never the author, a blocked pair, someone who muted the author, or a banned member. */
export function filterRecipients(
  candidates: readonly AlertCandidate[],
  sets: RecipientSets,
): string[] {
  return candidates
    .filter(
      (
        c,
      ) =>
        c.userId !==
          sets.authorId &&
        !sets.blockedWithAuthor.has(
          c.userId,
        ) &&
        !sets.mutedAuthor.has(
          c.userId,
        ) &&
        !isBannedNow(
          c.bannedUntil,
          sets.now,
        ),
    )
    .map(
      (
        c,
      ) =>
        c.userId,
    );
}

/** The oldest `createdAt` of an unread alert that still absorbs a new one. */
export function collapseSince(
  now: Date,
): Date {
  return new Date(
    now.getTime() -
      COLLAPSE_WINDOW_MS,
  );
}

/** Split recipients into those who get a fresh notification and those whose recent unread alert absorbs it. */
export function splitByCollapse(
  recipients: readonly string[],
  hasRecentUnread: ReadonlySet<string>,
): {
  fresh: string[];
  collapsed: string[];
} {
  const fresh: string[] =
    [];
  const collapsed: string[] =
    [];
  for (const id of recipients)
    (hasRecentUnread.has(
      id,
    )
      ? collapsed
      : fresh
    ).push(
      id,
    );
  return {
    fresh,
    collapsed,
  };
}

/** The text of a member's first alert. */
export function alertPreview(
  authorName: string,
  communityName: string,
): string {
  return `${authorName} posted in ${communityName}`;
}

/** The text an unread alert is rewritten to when more posts land inside the collapse window. */
export function collapsedPreview(
  communityName: string,
): string {
  return `New posts in ${communityName}`;
}

/** Where an alert leads: the post on its author's page. */
export function alertLink(
  author: {
    id: string;
    handle:
      | string
      | null;
  },
  postId: string,
): string {
  return `/u/${author.handle ?? author.id}/post/${postId}`;
}

/** The job payload and the key that makes enqueueing it idempotent. */
export interface PostAlertJob {
  postId: string;
}
export const postAlertJobKey =
  (
    postId: string,
  ): string =>
    `post:${postId}`;
