/**
 * Notification grouping (B6) — collapse a raw notification page into the
 * "**Alice and 4 others** liked your post" shape the list actually renders.
 *
 * Grouping happens on **read**, not on write, and that is the whole design:
 *
 *  - The rows are already persisted individually (each carries its own actor,
 *    which is what the avatar stack needs). Collapsing at write time would mean
 *    mutating a counter on an existing row and losing every actor but the last.
 *  - A grouping rule is a *presentation* decision that changes with the product
 *    ("group by hour" today, "group by day for likes" tomorrow). Baking it into
 *    stored rows makes it a migration; deriving it makes it a diff.
 *  - `Notification.groupKey` (written by the dispatch gateway) is a *batching*
 *    hint for delivery, not a display grouping — the two deliberately differ,
 *    since delivery batches per day and the list groups per hour.
 *
 * This module is PURE and has no database access on purpose: it is the piece
 * that is easy to get wrong (bucket boundaries, ordering, unread propagation)
 * and therefore the piece that must be unit-testable without a Postgres.
 */

/** The subset of a notification row this module needs. */
export interface GroupableNotification {
  id: string;
  /** `NotificationType` from Prisma — kept as a string so this stays client-safe. */
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  /** ISO string or Date; both are accepted because loaders serialize to ISO. */
  createdAt: string | Date;
  read?: boolean;
}

export interface NotificationGroup<T extends GroupableNotification = GroupableNotification> {
  /** Stable identity of the group: `<type>|<targetId>|<bucket>`. Safe as a React key. */
  key: string;
  type: string;
  /**
   * What the group is *about* — `"<entityType>:<entityId>"`, or `null` for
   * notifications with no target (a FOLLOW is about the actor, not an entity).
   */
  targetId: string | null;
  /** How many rows collapsed into this group. Always ≥ 1. */
  count: number;
  /** Newest `createdAt` in the group — what the list sorts and timestamps by. */
  latest: Date;
  /** Every row in the group, newest first. The first entry is the representative. */
  items: T[];
  /** True when ANY row in the group is unread — a group must not look read while
   *  it still contains something the user has not seen. */
  unread: boolean;
}

/** One hour. Long enough to fold a burst of likes, short enough that "2 hours
 *  ago" on the group header is never a lie about the newest item in it. */
export const DEFAULT_BUCKET_MS = 60 * 60 * 1000;

export interface GroupOptions {
  /**
   * Bucket width in milliseconds (default one hour). Buckets are absolute —
   * `floor(epochMs / bucketMs)` — not relative to the newest row, so the same
   * input produces the same grouping regardless of when it is rendered. A
   * sliding window would make the list reshuffle on every poll.
   */
  bucketMs?: number;
  /**
   * Types that are never grouped (each row stays its own group). Follows and
   * replies read as individual events; likes and reposts read as a pile.
   */
  neverGroup?: readonly string[];
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** `"<entityType>:<entityId>"`, or null when the row has no target entity. */
export function targetIdOf(row: GroupableNotification): string | null {
  if (!row.entityId) return null;
  return `${row.entityType ?? 'entity'}:${row.entityId}`;
}

/**
 * Collapse rows sharing `(type, targetId, hour-bucket)` into one group.
 *
 * Returns groups newest-first. Rows whose timestamp does not parse are kept as
 * singleton groups at epoch rather than dropped — a notification the user can
 * see in the badge count but not in the list is a worse bug than a badly
 * ordered one.
 */
export function groupNotifications<T extends GroupableNotification>(
  rows: readonly T[],
  options: GroupOptions = {},
): NotificationGroup<T>[] {
  const bucketMs = options.bucketMs && options.bucketMs > 0 ? options.bucketMs : DEFAULT_BUCKET_MS;
  const neverGroup = new Set(options.neverGroup ?? []);

  const groups = new Map<string, NotificationGroup<T>>();

  for (const row of rows) {
    const at = toDate(row.createdAt);
    const ms = Number.isNaN(at.getTime()) ? 0 : at.getTime();
    const target = targetIdOf(row);
    const bucket = Math.floor(ms / bucketMs);

    // Ungroupable types key on the row id so they can never merge with anything
    // — including another row of the same type in the same hour.
    const key = neverGroup.has(row.type)
      ? `${row.type}|${row.id}|single`
      : `${row.type}|${target ?? '-'}|${bucket}`;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        type: row.type,
        targetId: target,
        count: 1,
        latest: new Date(ms),
        items: [row],
        unread: row.read === false,
      });
      continue;
    }

    existing.count += 1;
    existing.items.push(row);
    existing.unread = existing.unread || row.read === false;
    if (ms > existing.latest.getTime()) existing.latest = new Date(ms);
  }

  const out = [...groups.values()];
  for (const group of out) {
    group.items.sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
  }
  // Newest group first; ties broken by key so the order is deterministic across
  // renders (two groups can genuinely share a millisecond in a seeded DB).
  out.sort((a, b) => b.latest.getTime() - a.latest.getTime() || (a.key < b.key ? -1 : 1));
  return out;
}

/**
 * How many rows a "mark all read" on this group would touch. Split out because
 * the list needs it for the optimistic badge decrement and computing it inline
 * in JSX is how the count and the mutation drift apart.
 */
export function unreadCountOf(group: NotificationGroup): number {
  return group.items.reduce((n, item) => n + (item.read === false ? 1 : 0), 0);
}
