import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { nextState, type Grade } from '@/lib/rmhstudy/srs';

const schema = z.object({ grade: z.number().int().min(0).max(3) });

/** POST /api/study/cards/$id/review — submit an SRS grade for a card. */
export const Route = createFileRoute('/api/study/cards/$id/review')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 120, windowMs: 60_000, prefix: 'card-review' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid grade' }, { status: 400 });

          const card = await prisma.flashcard.findUnique({
            where: { id: params.id },
            select: { id: true, deck: { select: { isPublic: true, userId: true } } },
          });
          if (!card) return Response.json({ error: 'Not found' }, { status: 404 });
          if (!card.deck.isPublic && card.deck.userId !== userId) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }

          const existing = await prisma.flashcardReview.findUnique({
            where: { userId_cardId: { userId, cardId: params.id } },
            select: { easeFactor: true, intervalDays: true, repetitions: true },
          });
          const prev = existing ?? { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };
          const next = nextState(prev, parsed.data.grade as Grade);

          await prisma.flashcardReview.upsert({
            where: { userId_cardId: { userId, cardId: params.id } },
            create: { userId, cardId: params.id, easeFactor: next.easeFactor, intervalDays: next.intervalDays, repetitions: next.repetitions, dueAt: next.dueAt },
            update: { easeFactor: next.easeFactor, intervalDays: next.intervalDays, repetitions: next.repetitions, dueAt: next.dueAt },
          });

          return Response.json({ success: true, dueAt: next.dueAt, intervalDays: next.intervalDays });
        } catch (error) {
          console.error('Card review error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
