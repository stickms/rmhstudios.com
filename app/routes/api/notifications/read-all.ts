/**
 * POST /api/notifications/read-all — clear the badge in one action (B6).
 *
 * `/api/notifications/read` already marks everything read via `{ all: true }`,
 * and that is the blunt version: it is all-or-nothing. Once the list groups
 * (`lib/notifications/group.ts`), the thing people actually want is "clear all
 * the likes and leave the replies alone" — twelve like-groups is what makes a
 * badge useless, and marking them individually is twelve requests plus twelve
 * chances for the optimistic count to drift.
 *
 * So the optional `type` filter is the whole point of this route: one request,
 * one authoritative count back, and the caller never has to reconcile a
 * per-group tally against the server's.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { adjustNotifUnread } from '@/lib/notifications.server';

/** Mirrors the Prisma `NotificationType` enum. Spelled out rather than derived
 *  so an invalid value is a 400 from zod instead of a Prisma error at the DB. */
const NOTIFICATION_TYPES = [
  'LIKE',
  'COMMENT',
  'REPLY',
  'FOLLOW',
  'MENTION',
  'REPOST',
  'SYSTEM',
] as const;

const schema = z.object({
  /** Omit to clear everything; pass a type to clear just that pile. */
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

export const Route = createFileRoute('/api/notifications/read-all')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: schema, allowEmptyBody: true },
        async ({ userId, body }) => {
          // `read: false` in the filter is load-bearing: it keeps `res.count` to
          // rows this call actually changed, so the badge counter below is never
          // over-decremented by a double-tap or a retried request.
          const res = await prisma.notification.updateMany({
            where: {
              userId,
              read: false,
              ...(body.type ? { type: body.type } : {}),
            },
            data: { read: true },
          });

          // Keep the denormalized Redis badge in step. It self-heals from a
          // COUNT on TTL expiry, but decrementing makes the badge match the list
          // in the same frame the user tapped.
          if (res.count > 0) void adjustNotifUnread(userId, -res.count);

          return Response.json({ success: true, updated: res.count });
        },
      ),
    },
  },
});
