import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deckReviewQueueApi } from '@/lib/study/decks.contract';
import { prisma } from '@/lib/prisma.server';
import { isCardKind } from '@/lib/study/card-types';
import { CARD_ORDER, REVIEWABLE_WHERE } from '@/lib/study/card-query.server';

/** GET /api/study/decks/$id/review — the viewer's due cards for this deck. */
export const route = apiRoute('/api/study/decks/$id/review', {
  GET: implement(deckReviewQueueApi, {}, async ({ params, session }) => {
    const userId = session.user.id;

    const deck = await prisma.flashcardDeck.findUnique({
      where: { id: params.id },
      select: { id: true, isPublic: true, userId: true },
    });
    if (!deck) return Response.json({ error: 'Not found' }, { status: 404 });
    if (!deck.isPublic && deck.userId !== userId)
      return Response.json({ error: 'Not found' }, { status: 404 });

    const cards = await prisma.flashcard.findMany({
      // Reviewable cards only: an authored cloze card is the text its generated cards are made from.
      where: { deckId: params.id, ...REVIEWABLE_WHERE },
      orderBy: CARD_ORDER,
      select: {
        id: true,
        front: true,
        back: true,
        kind: true,
        sourceId: true,
        clozeIndex: true,
        reviews: { where: { userId }, select: { dueAt: true } },
      },
    });

    const now = Date.now();
    const due = cards
      .filter((c) => {
        const r = c.reviews[0];
        return !r || r.dueAt.getTime() <= now;
      })
      .slice(0, 50)
      .map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        kind: isCardKind(c.kind) ? c.kind : ('basic' as const),
        clozeIndex: c.clozeIndex,
        sourceId: c.sourceId,
      }));

    return { due };
  }),
});
