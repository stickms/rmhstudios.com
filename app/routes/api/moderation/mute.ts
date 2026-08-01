import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { invalidateHiddenAuthors } from '@/lib/moderation.server';
import { z } from 'zod';

/**
 * POST /api/moderation/mute — toggle a mute on another user. Muting hides their
 * content from your feed without unfollowing them or notifying them.
 * GET — list the ids the current user has muted.
 */
const muteSchema = z.object({ targetUserId: z.string().min(1).max(64) });

export const Route = createFileRoute('/api/moderation/mute')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const mutes = await prisma.userMute.findMany({
          where: { muterId: session.user.id },
          select: { mutedId: true },
          orderBy: { createdAt: 'desc' },
        });
        return Response.json({ muted: mutes.map((m) => m.mutedId) });
      }),
      POST: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'moderation-mute' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => ({}));
          const parsed = muteSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const muterId = session.user.id;
          const mutedId = parsed.data.targetUserId;
          if (muterId === mutedId) {
            return Response.json({ error: 'You cannot mute yourself' }, { status: 400 });
          }

          const existing = await prisma.userMute.findUnique({
            where: { muterId_mutedId: { muterId, mutedId } },
          });

          if (existing) {
            await prisma.userMute.delete({ where: { id: existing.id } });
            invalidateHiddenAuthors(muterId);
            return Response.json({ success: true, muted: false });
          }

          await prisma.userMute.create({ data: { muterId, mutedId } });
          // The muter's hidden-author set changed — drop it so the mute takes
          // effect on their next feed read instead of after the TTL.
          invalidateHiddenAuthors(muterId);
          return Response.json({ success: true, muted: true });
        },
      ),
    },
  },
});
