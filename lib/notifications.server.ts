/**
 * Server-side helpers for creating in-app notifications.
 *
 * Call `createNotification` from the endpoints that produce social events
 * (likes, comments, replies, follows, mentions, reposts). Creation is
 * best-effort: failures are logged but never bubble up to break the originating
 * action (you should never fail a "like" because a notification insert failed).
 */

import { prisma } from '@/lib/prisma.server';
import { sendPushToUser, pushTitleFor } from '@/lib/push/send.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import type { NotificationType } from '@prisma/client';

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
  opts: { cursor?: string | null; limit?: number } = {}
): Promise<{ items: NotificationListItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const rows = await prisma.notification.findMany({
    where: { userId },
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
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
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
  /**
   * When true, collapse repeated identical unread notifications (same actor +
   * type + entity) into one instead of stacking. Used for like/follow/repost
   * toggles so a user un-liking and re-liking doesn't spam the recipient.
   */
  dedupeUnread?: boolean;
}

/** Which preference column governs each notification type. */
const PREF_FIELD: Record<NotificationType, 'likes' | 'comments' | 'follows' | 'mentions' | 'reposts' | 'system'> = {
  LIKE: 'likes',
  COMMENT: 'comments',
  REPLY: 'comments',
  FOLLOW: 'follows',
  MENTION: 'mentions',
  REPOST: 'reposts',
  SYSTEM: 'system',
};

/** True when the recipient has this notification type turned off. */
async function isMuted(input: CreateNotificationInput): Promise<boolean> {
  // Moderation notices always deliver — a user can't opt out of strikes.
  if (input.type === 'SYSTEM' && input.entityType === 'strike') return false;
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: input.userId },
  });
  if (!prefs) return false; // no row = defaults = everything on
  return !prefs[PREF_FIELD[input.type]];
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  // Never notify someone about their own action.
  if (input.actorId && input.actorId === input.userId) return;

  try {
    if (await isMuted(input)) return;

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

    await prisma.notification.create({
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        type: input.type,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        preview: input.preview?.slice(0, 280) ?? null,
        link: input.link ?? null,
      },
    });

    // Mirror to Web Push (no-op unless the user enabled push on a device and
    // VAPID keys are configured). Fire-and-forget: never delays the caller.
    void sendPushToUser(input.userId, {
      title: pushTitleFor(input.type),
      body: input.preview ?? undefined,
      url: input.link ?? '/notifications',
      tag: input.entityType && input.entityId ? `${input.entityType}:${input.entityId}` : undefined,
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
    await prisma.notification.deleteMany({
      where: {
        userId: input.userId,
        actorId: input.actorId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        read: false,
      },
    });
  } catch (err) {
    console.error('[notifications] failed to remove notification:', err);
  }
}
