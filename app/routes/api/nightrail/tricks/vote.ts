import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { voteTrickSchema, weekKey } from '@/lib/trick-week/trick-week';

/**
 * POST /api/nightrail/tricks/vote — one vote per member per week. Voting the same
 * trick again withdraws it; voting another moves your vote.
 */
export const Route = createFileRoute('/api/nightrail/tricks/vote')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: voteTrickSchema },
        async ({ userId, body }) => {
          const week = weekKey();
          const trick = await prisma.nightrailTrick.findUnique({
            where: { id: body.trickId },
            select: { week: true, authorId: true },
          });
          if (!trick) return Response.json({ error: 'not-found' }, { status: 404 });
          if (trick.week !== week) return Response.json({ error: 'week-closed' }, { status: 409 });
          if (trick.authorId === userId)
            return Response.json({ error: 'own-trick' }, { status: 403 });

          const myVoteTrickId = await prisma.$transaction(async (tx) => {
            const prev = await tx.nightrailTrickVote.findUnique({
              where: { week_userId: { week, userId } },
              select: { trickId: true },
            });
            if (prev) {
              await tx.nightrailTrickVote.delete({
                where: { trickId_userId: { trickId: prev.trickId, userId } },
              });
              await tx.nightrailTrick.update({
                where: { id: prev.trickId },
                data: { votes: { decrement: 1 } },
              });
              if (prev.trickId === body.trickId) return null;
            }
            await tx.nightrailTrickVote.create({ data: { trickId: body.trickId, userId, week } });
            await tx.nightrailTrick.update({
              where: { id: body.trickId },
              data: { votes: { increment: 1 } },
            });
            return body.trickId;
          });
          return Response.json({ myVoteTrickId });
        },
      ),
    },
  },
});
