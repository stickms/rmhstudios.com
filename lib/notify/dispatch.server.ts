/**
 * Notification dispatch gateway (§16). New notifiers call this instead of
 * createNotification directly: it resolves the recipient's per-category channel
 * matrix, suppresses push during quiet hours, and stamps a batching groupKey.
 * Best-effort — never throws into the caller.
 *
 * Migrating the existing createNotification call sites onto this gateway (and
 * then dropping the legacy boolean columns) is the follow-up; this ships the
 * gateway + the preference surface so new features land on the matrix.
 *
 * ── The Next 100 (2026-08-05) ──────────────────────────────────────────────
 * Three additive fields, all optional, all no-ops for the existing call sites:
 *
 *  - `urgency: 'critical'` (B11) — bypass quiet hours. Security and legal only;
 *    "important" is not a reason, or every notifier eventually claims it.
 *  - `scopeKey` (B14) — run the per-conversation All/Mentions/None gate. Only
 *    consulted when present, so a notifier that knows nothing about
 *    conversations is unaffected.
 *  - a suppressed push is now HELD, not dropped (B13) — see `held.server.ts`.
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
import { holdNotification } from '@/lib/notify/held.server';
import { getConversationPref, shouldDeliver } from '@/lib/notify/conversation-prefs.server';

/**
 * How hard this notification is allowed to push through the user's own
 * settings.
 *
 * `critical` exists for exactly two families — account security (a sign-in from
 * an unrecognised device) and legal/compliance notices — where the delay quiet
 * hours would impose *is* the harm being notified about. It does not override
 * the channel matrix: a user who turned push off has made a durable choice
 * about their devices, whereas quiet hours are a statement about the *hour*.
 */
export type DispatchUrgency = 'normal' | 'critical';

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
  /** Defaults to `'normal'`. See {@link DispatchUrgency} before reaching for `'critical'`. */
  urgency?: DispatchUrgency;
  /**
   * Conversation this belongs to (`dm:<id>` | `group:<id>` | `space:<id>`).
   * Present ⇒ the per-conversation three-way gate runs first.
   */
  scopeKey?: string;
  /**
   * Whether the recipient was personally addressed — the input to "Mentions
   * only". Defaults to `type === 'MENTION'`, which is right for the feed; a
   * chat notifier that detects @-mentions itself passes it explicitly.
   */
  isMention?: boolean;
}

export async function dispatch(input: DispatchInput): Promise<void> {
  try {
    const critical = input.urgency === 'critical';

    // B14 — the conversation gate runs BEFORE anything else. A muted thread
    // should not even produce an in-app row: the user's request was "this
    // conversation is not a notification source", not "notify me quietly".
    // Critical notices are never conversation-scoped, so there is no interaction
    // between the two overrides to reason about.
    if (input.scopeKey) {
      const pref = await getConversationPref(input.userId, input.scopeKey);
      const isMention = input.isMention ?? input.type === 'MENTION';
      if (!shouldDeliver(pref, isMention)) return;
    }

    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: input.userId },
      select: { matrix: true, quietStart: true, quietEnd: true, tz: true },
    });
    const ch = resolveChannels((prefs?.matrix as NotifyMatrix) ?? {}, input.category);
    const quiet =
      !critical &&
      inQuietHours(minutesInTz(new Date(), prefs?.tz), prefs?.quietStart, prefs?.quietEnd);
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

    // B13 — hold, don't drop. Reached only when the user WANTS push for this
    // category (`ch.push`) and the clock is the sole reason it was withheld.
    // `!ch.push` is a durable preference and is still a plain drop: replaying it
    // at 07:00 would deliver a push to someone who turned push off.
    if (ch.push && quiet) {
      await holdNotification({
        userId: input.userId,
        category: input.category,
        channel: 'push',
        payload: {
          title: pushTitleFor(input.type),
          ...(input.preview ? { body: input.preview } : {}),
          url: input.link ?? '/notifications',
          ...(input.entityType && input.entityId
            ? { tag: `${input.entityType}:${input.entityId}` }
            : {}),
        },
        // Reuse the batching key when there is one: the flush wants the same
        // granularity the digest does, and two spellings of "same thing" drift.
        dedupeKey:
          input.groupKey ??
          (input.entityType && input.entityId
            ? `${input.type}:${input.entityType}:${input.entityId}`
            : null),
      });
    }
    // Email is delivered by the digest jobs, not per-event — unchanged here.
  } catch (err) {
    console.error('[notify] dispatch failed:', err);
  }
}
