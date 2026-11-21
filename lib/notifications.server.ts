import { pageSize } from '@/lib/pagination';
/**
 * Server-side helpers for creating in-app notifications.
 *
 * Call `createNotification` from the endpoints that produce social events
 * (likes, comments, replies, follows, mentions, reposts). Creation is
 * best-effort: failures are logged but never bubble up to break the originating
 * action (you should never fail a "like" because a notification insert failed).
 */

import { prisma } from '@/lib/prisma.server';
import { sendPushToUser, pushTitleFor, pushActionsFor } from '@/lib/push/send.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { redisEnabled, redisGetJSON, redisSetJSON, redisIncrBy } from '@/lib/redis.server';
import { cachedNullable, invalidateCached } from '@/lib/cached.server';
import {
  inQuietHours,
  minutesInTz,
  resolveChannels,
  type NotifyCategory,
  type NotifyMatrix,
} from '@/lib/notify/categories';
import { holdNotification } from '@/lib/notify/held.server';
import type { NotificationType } from '@prisma/client';

/**
 * Denormalized per-user unread-notification counter in Redis. The unread badge
 * is polled frequently per client; reading a counter avoids a `COUNT` on every
 * poll. The counter is a *cache over a warm key*: `getUnreadNotificationCount`
 * lazily backfills it from a real COUNT (with a short TTL) on a miss, and the
 * create/remove writers only nudge an already-warm key — never initialize a
 * cold one to a partial value (a cold key just backfills correctly on the next
 * read, since the notification row is already persisted). Everything degrades to
 * a direct COUNT without Redis.
 */
const NOTIF_UNREAD_TTL_MS = 60_000;
const notifUnreadKey = (userId: string) => `notif:unread:${userId}`;

/**
 * Read a user's unread-notification count from the Redis counter, falling back
 * to `prisma.notification.count` when Redis is unavailable or the counter is
 * unset (lazily initializing + caching it on that first miss).
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  if (redisEnabled()) {
    const key = notifUnreadKey(userId);
    const cached = await redisGetJSON<number>(key);
    if (typeof cached === 'number' && cached >= 0) return cached;
    const count = await prisma.notification.count({ where: { userId, read: false } });
    await redisSetJSON(key, count, NOTIF_UNREAD_TTL_MS);
    return count;
  }
  return prisma.notification.count({ where: { userId, read: false } });
}

/** Nudge a *warm* unread counter by `delta`, clamped at 0. No-op without Redis
 * or when the counter isn't currently cached. */
export async function adjustNotifUnread(userId: string, delta: number): Promise<void> {
  if (delta === 0 || !redisEnabled()) return;
  try {
    const key = notifUnreadKey(userId);
    const current = await redisGetJSON<number>(key);
    if (typeof current !== 'number') return; // cold — let the next read backfill
    const next = await redisIncrBy(key, delta, NOTIF_UNREAD_TTL_MS);
    if (next !== null && next < 0) await redisIncrBy(key, -next, NOTIF_UNREAD_TTL_MS);
  } catch {
    /* best-effort — the counter self-heals from COUNT on TTL expiry */
  }
}

export interface NotificationListItem {
  id: string;
  type: NotificationType;
  entityType: string | null;
  entityId: string | null;
  preview: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: ReturnType<typeof resolveUser> | null;
}

/**
 * List a user's notifications, newest first (cursor-paginated). Shared by the
 * `/api/notifications` GET handler and the `/notifications` route loader so the
 * page is server-rendered / prefetched instead of fetched on mount.
 */
export async function listNotifications(
  userId: string,
  opts: {
    cursor?: string | null;
    limit?: number;
    /** Only these types (a filter's types). */
    types?: NotificationType[];
    /** The inbox's Unread view: rows unread now, plus these ids (unread when the inbox opened). Scoped to the caller. */
    unread?: { alsoIds: string[] };
  } = {},
): Promise<{ items: NotificationListItem[]; nextCursor: string | null }> {
  const limit = pageSize(opts.limit);
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(opts.types ? { type: { in: opts.types } } : {}),
      ...(opts.unread
        ? { OR: [{ read: false }, ...(opts.unread.alsoIds.length ? [{ id: { in: opts.unread.alsoIds } }] : [])] }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    include: { actor: { select: userDisplaySelect } },
  });
  const hasMore = rows.length > limit;
  const items: NotificationListItem[] = (hasMore ? rows.slice(0, limit) : rows).map((n) => ({
    id: n.id,
    type: n.type,
    entityType: n.entityType,
    entityId: n.entityId,
    preview: n.preview,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
    actor: n.actor ? resolveUser(n.actor) : null,
  }));
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export interface CreateNotificationInput {
  /** Recipient user id. */
  userId: string;
  /** Who triggered it. Omit for SYSTEM notifications. */
  actorId?: string | null;
  type: NotificationType;
  entityType?: string | null;
  entityId?: string | null;
  preview?: string | null;
  link?: string | null;
  /** §16 batching key — rows sharing it collapse in the list/badge. */
  groupKey?: string | null;
  /**
   * The settings-grid row this belongs to, when its type alone does not say. Tips and awards are `SYSTEM` rows but
   * belong to "Tips & awards" (`economy`), which has no per-type column: its in-app and push switches are read from
   * the grid directly. Defaults to the type's category ({@link TYPE_CATEGORY}).
   */
  category?: NotifyCategory;
  /**
   * §16 — the push decision, already made. `dispatch()` sets it from the
   * category grid and quiet hours. Left undefined (every direct caller), this
   * function makes the same decision itself from the notification's type.
   */
  skipPush?: boolean;
  /**
   * When true, collapse repeated identical unread notifications (same actor +
   * type + entity) into one instead of stacking. Used for like/follow/repost
   * toggles so a user un-liking and re-liking doesn't spam the recipient.
   */
  dedupeUnread?: boolean;
}

/** Which preference column governs each notification type. */
const PREF_FIELD: Record<
  NotificationType,
  'likes' | 'comments' | 'follows' | 'mentions' | 'reposts' | 'system'
> = {
  LIKE: 'likes',
  COMMENT: 'comments',
  REPLY: 'comments',
  FOLLOW: 'follows',
  MENTION: 'mentions',
  REPOST: 'reposts',
  SYSTEM: 'system',
};

/**
 * Notification kinds that ignore preferences entirely.
 *
 * These are not "important" notices — they are notices whose whole purpose is
 * defeated by being suppressible. A user who turned system notifications off
 * months ago has not consented to never hearing that someone signed into their
 * account from an unfamiliar device; they have consented to fewer achievement
 * pings. Keep this list short and keep the bar at "suppressing this harms the
 * user".
 */
const UNMUTABLE_ENTITY_TYPES: ReadonlySet<string> = new Set([
  // A user cannot opt out of moderation notices.
  'strike',
  // Content removed or edited by site moderation, and feature timeouts.
  'moderation',
  // New-device / new-location sign-in alerts (B11). The email goes out
  // regardless; this is what puts the matching row in the notification centre.
  'security',
  // A reminder the user set for themselves (U7). Turning off "system"
  // notifications is not a request to silently drop a reminder they asked for.
  'reminder',
]);

/**
 * The settings-grid category each type belongs to — the same grouping the grid's
 * in-app switch already drives through the per-type columns
 * (`CATEGORY_COLUMNS` in `lib/notify/legacy-columns.ts`).
 */
const TYPE_CATEGORY: Record<NotificationType, NotifyCategory> = {
  LIKE: 'social',
  REPOST: 'social',
  COMMENT: 'replies',
  REPLY: 'replies',
  MENTION: 'replies',
  FOLLOW: 'follows',
  SYSTEM: 'system',
};

const PREF_TTL_MS = 60_000;
const prefKey = (userId: string) => `notif-pref:${userId}`;

interface RecipientPrefs {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  reposts: boolean;
  system: boolean;
  matrix: unknown;
  quietStart: number | null;
  quietEnd: number | null;
  tz: string | null;
}

function isUnmutable(input: CreateNotificationInput): boolean {
  return input.type === 'SYSTEM' && !!input.entityType && UNMUTABLE_ENTITY_TYPES.has(input.entityType);
}

/**
 * The recipient's notification preferences, or null for no row (= defaults).
 * perf: this ran an uncached SELECT for EVERY notification created (likes and
 * comments fan out heavily). 60s L1/L2 cache; every preference writer calls
 * invalidateNotificationPrefs() so a toggle takes effect immediately.
 */
function loadPrefs(userId: string): Promise<RecipientPrefs | null> {
  return cachedNullable(prefKey(userId), PREF_TTL_MS, () =>
    prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        likes: true,
        comments: true,
        follows: true,
        mentions: true,
        reposts: true,
        system: true,
        matrix: true,
        quietStart: true,
        quietEnd: true,
        tz: true,
      },
    }),
  );
}

/** True when the recipient has this notification type turned off. */
function isMuted(input: CreateNotificationInput, prefs: RecipientPrefs | null): boolean {
  if (isUnmutable(input)) return false;
  if (!prefs) return false; // no row = defaults = everything on
  // A category with no per-type column (economy) is read from the grid; the rest keep their columns, which the grid's
  // in-app switch writes (lib/notify/legacy-columns.ts).
  if (input.category && input.category !== TYPE_CATEGORY[input.type]) {
    return !resolveChannels((prefs.matrix as NotifyMatrix | null) ?? {}, input.category).inapp;
  }
  return !prefs[PREF_FIELD[input.type]];
}

/**
 * What to do with the push mirror for a caller that did not decide (`skipPush`
 * undefined). Before this, every direct `createNotification()` call — likes,
 * reposts, follows, replies, tips, keyword alerts — pushed regardless of the
 * grid's Push column and of quiet hours, which only `dispatch()` read, so those
 * two settings did nothing for most notifications (settings audit, 2026-11-19).
 * The rule is `dispatch()`'s: Push off is a plain drop; quiet hours hold the
 * push for the morning flush; an unmutable notice (security, moderation, a
 * reminder) is not held by the clock.
 */
function pushDecision(
  input: CreateNotificationInput,
  prefs: RecipientPrefs | null,
): 'send' | 'drop' | 'hold' {
  if (input.skipPush === true) return 'drop';
  if (input.skipPush === false || !prefs) return 'send';
  const category = input.category ?? TYPE_CATEGORY[input.type];
  if (!resolveChannels((prefs.matrix as NotifyMatrix | null) ?? {}, category).push) return 'drop';
  if (isUnmutable(input)) return 'send';
  return inQuietHours(minutesInTz(new Date(), prefs.tz), prefs.quietStart, prefs.quietEnd)
    ? 'hold'
    : 'send';
}

/** Drop the cached mute preferences — call after ANY write to notificationPreference. */
export function invalidateNotificationPrefs(userId: string): void {
  void invalidateCached(prefKey(userId));
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  // Never notify someone about their own action.
  if (input.actorId && input.actorId === input.userId) return;

  try {
    const prefs = await loadPrefs(input.userId);
    if (isMuted(input, prefs)) return;

    if (input.dedupeUnread) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: input.userId,
          actorId: input.actorId ?? null,
          type: input.type,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          read: false,
        },
        select: { id: true },
      });
      if (existing) {
        // Refresh its timestamp so it surfaces to the top again. Deduped
        // refreshes deliberately do NOT re-push — the device was already told.
        await prisma.notification.update({
          where: { id: existing.id },
          data: { createdAt: new Date(), preview: input.preview ?? undefined },
        });
        return;
      }
    }

    const created = await prisma.notification.create({
      select: { id: true },
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        type: input.type,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        preview: input.preview?.slice(0, 280) ?? null,
        link: input.link ?? null,
        groupKey: input.groupKey ?? null,
      },
    });

    // A fresh unread row was created — bump the recipient's denormalized counter
    // (dedupe refreshes above don't reach here, so they don't double-count).
    void adjustNotifUnread(input.userId, 1);

    // Mirror to Web Push (no-op unless the user enabled push on a device and
    // VAPID keys are configured). Fire-and-forget: never delays the caller.
    const push = pushDecision(input, prefs);
    if (push === 'drop') return;
    const tag = input.entityType && input.entityId ? `${input.entityType}:${input.entityId}` : undefined;
    if (push === 'hold') {
      void holdNotification({
        userId: input.userId,
        category: input.category ?? TYPE_CATEGORY[input.type],
        channel: 'push',
        payload: {
          title: pushTitleFor(input.type),
          ...(input.preview ? { body: input.preview } : {}),
          url: input.link ?? '/notifications',
          ...(tag ? { tag } : {}),
        },
        dedupeKey:
          input.groupKey ??
          (input.entityType && input.entityId
            ? `${input.type}:${input.entityType}:${input.entityId}`
            : null),
      });
      return;
    }
    void sendPushToUser(input.userId, {
      title: pushTitleFor(input.type),
      body: input.preview ?? undefined,
      url: input.link ?? '/notifications',
      tag,
      nid: created.id,
      actions: pushActionsFor(input.type, input.entityType),
    });
  } catch (err) {
    console.error('[notifications] failed to create notification:', err);
  }
}

/** Remove an unread notification when its triggering action is undone (e.g. unlike). */
export async function removeNotification(input: {
  userId: string;
  actorId: string;
  type: NotificationType;
  entityType: string;
  entityId: string;
}): Promise<void> {
  try {
    const res = await prisma.notification.deleteMany({
      where: {
        userId: input.userId,
        actorId: input.actorId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        read: false,
      },
    });
    // Removed unread rows — decrement the recipient's denormalized counter.
    if (res.count > 0) void adjustNotifUnread(input.userId, -res.count);
  } catch (err) {
    console.error('[notifications] failed to remove notification:', err);
  }
}
