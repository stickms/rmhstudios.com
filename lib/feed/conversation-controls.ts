/**
 * Conversation controls on feed posts: mute a post's whole conversation, and pin one reply to the top of it.
 *
 * Pure and client-safe (no Prisma): the thread-root rule, the mute durations and the reply order live here so the server and
 * the reply list read one definition. The persistence is `conversation-controls.server.ts`.
 */

/** What the mute menu offers, in the order it shows them. */
export const MUTE_CHOICES =
  [
    'mentions',
    '24h',
    '7d',
    'forever',
  ] as const;
export type MuteChoice =
  (typeof MUTE_CHOICES)[number];

export type MuteMode =
  | 'all'
  | 'mentions'
  | 'none';

const HOUR_MS =
  60 *
  60 *
  1000;
const DURATION_MS: Record<
  | '24h'
  | '7d',
  number
> =
  {
    '24h':
      24 *
      HOUR_MS,
    '7d':
      7 *
      24 *
      HOUR_MS,
  };

/** "Until I turn it back on": a far-future `muteUntil`, as `ConversationPref` documents. */
export const MUTE_FOREVER =
  new Date(
    '9999-12-31T00:00:00.000Z',
  );

/** A `muteUntil` this far out is the open-ended mute, not a date to show. */
export function isIndefiniteMute(
  until:
    | Date
    | string
    | null
    | undefined,
): boolean {
  if (
    !until
  )
    return false;
  const ms =
    typeof until ===
    'string'
      ? Date.parse(
          until,
        )
      : until.getTime();
  return (
    Number.isFinite(
      ms,
    ) &&
    ms >=
      Date.UTC(
        3000,
        0,
        1,
      )
  );
}

/** The stored fields a choice means. Mentions only is not a mute: it keeps the thread audible for replies addressed to you. */
export function muteFieldsFor(
  choice: MuteChoice,
  now: Date = new Date(),
): {
  muteUntil: Date | null;
  mentionsOnly: boolean;
} {
  if (
    choice ===
    'mentions'
  )
    return {
      muteUntil:
        null,
      mentionsOnly: true,
    };
  if (
    choice ===
    'forever'
  )
    return {
      muteUntil:
        MUTE_FOREVER,
      mentionsOnly: false,
    };
  return {
    muteUntil:
      new Date(
        now.getTime() +
          DURATION_MS[
            choice
          ],
      ),
    mentionsOnly: false,
  };
}

/**
 * The conversation a post belongs to: its thread root, or itself when it is not a follow-up segment. Muting from any post
 * in a thread therefore mutes all of it.
 */
export function conversationRootId(post: {
  id: string;
  threadRootId:
    | string
    | null;
}): string {
  return (
    post.threadRootId ??
    post.id
  );
}

/** The post's first non-empty line, trimmed to `max` characters, for the Muted conversations list. */
export function firstLine(
  text:
    | string
    | null
    | undefined,
  max = 120,
): string {
  const line =
    (
      text ??
      ''
    )
      .split(
        /\r?\n/,
      )
      .find(
        (
          l,
        ) =>
          l.trim()
            .length >
          0,
      )
      ?.trim() ??
    '';
  return line.length >
    max
    ? `${line.slice(0, max - 1).trimEnd()}…`
    : line;
}

interface OrderableReply {
  id: string;
  hidden?: boolean;
  deletedAt?:
    | string
    | null;
}

/**
 * The replies to show under a post: the visible ones, with the pinned reply first, and the hidden ones for the "Hidden
 * replies" disclosure. A pinned reply that is hidden or deleted is not pinned (the server unpins on hide and delete; this
 * covers the window before the reply list refreshes). Order is otherwise preserved.
 */
export function orderReplies<
  T extends
    OrderableReply,
>(
  replies: readonly T[],
  pinnedReplyId:
    | string
    | null
    | undefined,
): {
  visible: T[];
  hidden: T[];
  pinned: T | null;
} {
  const hidden =
    replies.filter(
      (
        r,
      ) =>
        r.hidden,
    );
  const rest =
    replies.filter(
      (
        r,
      ) =>
        !r.hidden,
    );
  const pinned =
    pinnedReplyId
      ? (rest.find(
          (
            r,
          ) =>
            r.id ===
              pinnedReplyId &&
            !r.deletedAt,
        ) ??
        null)
      : null;
  return {
    visible:
      pinned
        ? [
            pinned,
            ...rest.filter(
              (
                r,
              ) =>
                r !==
                pinned,
            ),
          ]
        : rest,
    hidden,
    pinned,
  };
}
