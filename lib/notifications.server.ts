/**
 * Server-side helpers for creating in-app notifications.
 *
 * Call `createNotification` from the endpoints that produce social events
 * (likes, comments, replies, follows, mentions, reposts). Creation is
 * best-effort: failures are logged but never bubble up to break the originating
 * action (you should never fail a "like" because a notification insert failed).
 */

import { prisma } from '@/lib/prisma.server';
import type { NotificationType } from '@prisma/client';

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

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  // Never notify someone about their own action.
  if (input.actorId && input.actorId === input.userId) return;

  try {
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
        // Refresh its timestamp so it surfaces to the top again.
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
