/**
 * /api/calls/mute — silence one caller for a while.
 *
 * The incoming-call banner writes here ("mute for 1h / 8h / 24h / 1w") and the
 * Calls settings read it so a mute can be lifted early. Like the privacy
 * setting this only reads and writes the preference: the refusal itself happens
 * on the socket hub, and a muted caller is told the same generic "can't call"
 * as for a block or the privacy setting, never that they were muted.
 */
import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/call/calls.contract';
import { prisma } from '@/lib/prisma.server';
import { listActiveCallMutes } from '@/lib/settings/prefs.server';
import { CALL_MUTE_DURATION_KEYS, muteUntil, type CallMuteDuration } from '@/lib/call/mute';

const userId = z.string().min(1).max(64);

export const route = apiRoute('/api/calls/mute', {
  // Active mutes only: a lapsed row is inert, so listing it would just be noise.
  GET: implement(C.listCallMutesApi, { rateLimit: 'read' }, async ({ userId: me }) =>
    Response.json(await listActiveCallMutes(me)),
  ),

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

  DELETE: implement(
    C.unmuteCallerApi,
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
});
