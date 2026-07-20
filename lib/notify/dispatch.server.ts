/**
 * Notification dispatch gateway (§16). New notifiers call this instead of
 * createNotification directly: it resolves the recipient's per-category channel
 * matrix, suppresses push during quiet hours, and stamps a batching groupKey.
 * Best-effort — never throws into the caller.
 *
 * Migrating the existing createNotification call sites onto this gateway (and
 * then dropping the legacy boolean columns) is the follow-up; this ships the
 * gateway + the preference surface so new features land on the matrix.
 */
import type { NotificationType } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { sendPushToUser, pushTitleFor } from '@/lib/push/send.server';
import {
  resolveChannels,
  inQuietHours,
  minutesInTz,
  type NotifyCategory,
  type NotifyMatrix,
} from '@/lib/notify/categories';

export interface DispatchInput {
  userId: string;
  category: NotifyCategory;
  type: NotificationType;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  preview?: string;
  link?: string;
  /** Batching key, e.g. `like:rmhark:<id>:<dayKey>`. */
  groupKey?: string;
}

export async function dispatch(input: DispatchInput): Promise<void> {
  try {
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: input.userId },
      select: { matrix: true, quietStart: true, quietEnd: true, tz: true },
    });
    const ch = resolveChannels((prefs?.matrix as NotifyMatrix) ?? {}, input.category);
    const quiet = inQuietHours(minutesInTz(new Date(), prefs?.tz), prefs?.quietStart, prefs?.quietEnd);
    const wantPush = ch.push && !quiet;

    if (ch.inapp) {
      // In-app row (+ push mirror unless suppressed by channel/quiet-hours).
      await createNotification({
        userId: input.userId,
        actorId: input.actorId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        preview: input.preview,
        link: input.link,
        groupKey: input.groupKey,
        skipPush: !wantPush,
      });
    } else if (wantPush) {
      // Push-only (in-app muted for this category) — direct push, no row.
      void sendPushToUser(input.userId, {
        title: pushTitleFor(input.type),
        body: input.preview ?? undefined,
        url: input.link ?? '/notifications',
      });
    }
    // Email is delivered by the digest jobs, not per-event — unchanged here.
  } catch (err) {
    console.error('[notify] dispatch failed:', err);
  }
}
