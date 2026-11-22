import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { reviewCardApi } from '@/lib/study/decks.contract';
import { reviewCardBody } from '@/lib/study/decks-schema';
import { prisma } from '@/lib/prisma.server';
import { isReviewable } from '@/lib/study/card-types';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { nextState, type Grade } from '@/lib/rmhstudy/srs';
import { isLapse } from '@/lib/study/queue';
import { saveReview } from '@/lib/study/review-log.server';
import { recordStudyReview } from '@/lib/quests/engine.server';

/** POST /api/study/cards/$id/review — submit an SRS grade for a card. */
export const route = apiRoute('/api/study/cards/$id/review', {
  POST: implement(
    reviewCardApi,
    {
      body: reviewCardBody,
      invalid: () => Response.json({ error: 'Invalid grade' }, { status: 400 }),
    },
    async ({ request, params, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed } = rateLimit(ip, {
        limit: 120,
        windowMs: 60_000,
        prefix: 'card-review',
      });
      if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

      const card = await prisma.flashcard.findUnique({
        where: { id: params.id },
        select: { id: true, deckId: true, kind: true, sourceId: true, deck: { select: { isPublic: true, userId: true } } },
      });
      if (!card) return Response.json({ error: 'Not found' }, { status: 404 });
      // An authored cloze card is never reviewed; its generated cards are.
      if (!isReviewable(card)) return Response.json({ error: 'Not found' }, { status: 404 });
      if (!card.deck.isPublic && card.deck.userId !== userId) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }

      const existing = await prisma.flashcardReview.findUnique({
        where: { userId_cardId: { userId, cardId: params.id } },
        select: { easeFactor: true, intervalDays: true, repetitions: true },
      });
      const prev = existing ?? { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };
      const next = nextState(prev, body.grade as Grade);

      const { leech } = await saveReview({
        lapse: isLapse(body.grade, prev.repetitions),
        userId,
        cardId: params.id,
        deckId: card.deckId,
        grade: body.grade,
        next,
      });

      // Progress the daily "study" quest + award XP (best-effort, rate-limited).
      await recordStudyReview(userId);

      return Response.json({
        success: true,
        dueAt: next.dueAt,
        intervalDays: next.intervalDays,
        leech,
      });
    },
  ),
});
