import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { voteSignalSchema } from '@/lib/massive-march/signals';

/** POST /api/massive-march/signals/vote — rate a hint up (1) or down (-1); 0 withdraws. */
export const Route = createFileRoute('/api/massive-march/signals/vote')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: voteSignalSchema },
        async ({ userId, body }) => {
          const signal = await prisma.marchSignal.findUnique({
            where: { id: body.signalId },
            select: { authorId: true },
          });
          if (!signal) return Response.json({ error: 'not-found' }, { status: 404 });
          if (signal.authorId === userId)
            return Response.json({ error: 'own-signal' }, { status: 403 });

          const where = { signalId_userId: { signalId: body.signalId, userId } };
          const score = await prisma.$transaction(async (tx) => {
            const prev =
              (await tx.marchSignalVote.findUnique({ where, select: { value: true } }))?.value ?? 0;
            if (body.value === 0) {
              if (prev !== 0) await tx.marchSignalVote.delete({ where });
            } else {
              await tx.marchSignalVote.upsert({
                where,
                create: { signalId: body.signalId, userId, value: body.value },
                update: { value: body.value },
              });
            }
            const updated = await tx.marchSignal.update({
              where: { id: body.signalId },
              data: { score: { increment: body.value - prev } },
              select: { score: true },
            });
            return updated.score;
          });
          return Response.json({ score, myVote: body.value });
        },
      ),
    },
  },
});
