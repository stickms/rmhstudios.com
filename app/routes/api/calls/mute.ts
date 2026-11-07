/**
 * /api/calls/mute — silence one caller for a while.
 *
 * The incoming-call banner writes here ("mute for 1h / 8h / 24h / 1w") and the
 * Calls settings read it so a mute can be lifted early. Like the privacy
 * setting this only reads and writes the preference: the refusal itself happens
 * on the socket hub, and a muted caller is told the same generic "can't call"
 * as for a block or the privacy setting, never that they were muted.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { CALL_MUTE_DURATION_KEYS, muteUntil, type CallMuteDuration } from '@/lib/call/mute';

const userId = z.string().min(1).max(64);

export const Route = createFileRoute('/api/calls/mute')({
  server: {
    handlers: {
      // Active mutes only: a lapsed row is inert, so listing it would just be noise.
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId: me }) => {
        const rows = await prisma.callMute.findMany({
          where: { userId: me, until: { gt: new Date() } },
          orderBy: { until: 'asc' },
          take: 100,
          select: { until: true, muted: { select: userChipSelect } },
        });
        return Response.json({
          mutes: rows.map((r) => ({ until: r.until.toISOString(), user: r.muted })),
        });
      }),

      POST: defineHandler(
        {
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'call-mute' },
          body: z.object({
            targetUserId: userId,
            duration: z.enum(CALL_MUTE_DURATION_KEYS as [CallMuteDuration, ...CallMuteDuration[]]),
          }),
        },
        async ({ userId: me, body }) => {
          if (body.targetUserId === me) {
            return Response.json({ error: 'You cannot mute yourself' }, { status: 400 });
          }
          const target = await prisma.user.findUnique({
            where: { id: body.targetUserId },
            select: { id: true },
          });
          if (!target) return Response.json({ error: 'User not found' }, { status: 404 });

          const until = muteUntil(body.duration);
          // Re-muting replaces the old deadline (shorter or longer), which is
          // also how a lapsed row gets reused.
          await prisma.callMute.upsert({
            where: { userId_mutedUserId: { userId: me, mutedUserId: body.targetUserId } },
            create: { userId: me, mutedUserId: body.targetUserId, until },
            update: { until },
          });
          return Response.json({ muted: true, until: until.toISOString() });
        },
      ),

      DELETE: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({ targetUserId: userId }),
        },
        async ({ userId: me, body }) => {
          await prisma.callMute.deleteMany({
            where: { userId: me, mutedUserId: body.targetUserId },
          });
          return Response.json({ muted: false });
        },
      ),
    },
  },
});
