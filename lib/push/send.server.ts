/**
 * Web Push sending. Best-effort by design: push must never break the action
 * that produced a notification, and the whole feature degrades to a no-op
 * when VAPID keys are not configured (see .env.example).
 *
 * Generate keys once with: npx web-push generate-vapid-keys
 */

import webpush from 'web-push';
import { prisma } from '@/lib/prisma.server';
import type { NotificationType } from '@prisma/client';

let configured: boolean | null = null;

/** Configure web-push from env exactly once. Returns whether push is usable. */
export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@rmhstudios.com',
      publicKey,
      privateKey
    );
    configured = true;
  } catch (err) {
    console.error('[push] invalid VAPID configuration:', err);
    configured = false;
  }
  return configured;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  /** Coalesces notifications with the same tag on the device. */
  tag?: string;
}

/**
 * Send a push message to every subscription a user has. Dead subscriptions
 * (push service answered 404/410) are deleted as we go.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
            { TTL: 60 * 60 * 24 }
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error('[push] send failed:', status ?? err);
          }
        }
      })
    );
  } catch (err) {
    console.error('[push] sendPushToUser failed:', err);
  }
}

const TYPE_TITLES: Record<NotificationType, string> = {
  LIKE: 'New like',
  COMMENT: 'New comment',
  REPLY: 'New reply',
  FOLLOW: 'New follower',
  MENTION: 'You were mentioned',
  REPOST: 'New repost',
  SYSTEM: 'RMH Studios',
};

/** Title line for a push mirroring an in-app notification. */
export function pushTitleFor(type: NotificationType): string {
  return TYPE_TITLES[type] ?? 'RMH Studios';
}
