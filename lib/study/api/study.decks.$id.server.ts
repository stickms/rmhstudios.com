import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { addDeckCardApi, deleteDeckApi, getDeckApi } from '@/lib/study/decks.contract';
import { addCardBody } from '@/lib/study/decks-schema';
import { prisma } from '@/lib/prisma.server';
import { getDeck } from '@/lib/study.server';

/**
 * GET    /api/study/decks/$id — deck detail with cards (owner or public).
 * POST   /api/study/decks/$id — add a card (owner).
 * DELETE /api/study/decks/$id — delete the deck (owner).
 */
export const route = apiRoute('/api/study/decks/$id', {
  GET: implement(getDeckApi, { auth: 'optional' }, async ({ params, session }) => {
    const detail = await getDeck(params.id, { id: session?.user?.id ?? null });
    if (!detail) return Response.json({ error: 'Not found' }, { status: 404 });
    return detail;
  }),

  POST: implement(addDeckCardApi, {}, async ({ request, params, session }) => {
    const deck = await prisma.flashcardDeck.findUnique({
      where: { id: params.id },
      select: { userId: true, cardCount: true },
    });
    if (!deck || deck.userId !== session.user.id)
      return Response.json({ error: 'Not found' }, { status: 404 });
    if (deck.cardCount >= 1000) return Response.json({ error: 'Deck is full' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const parsed = addCardBody.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid card' }, { status: 400 });

    const [card] = await prisma.$transaction([
      prisma.flashcard.create({
        data: {
          deckId: params.id,
          front: parsed.data.front.trim(),
          back: parsed.data.back.trim(),
          position: deck.cardCount,
        },
        select: { id: true, front: true, back: true },
      }),
      prisma.flashcardDeck.update({
        where: { id: params.id },
        data: { cardCount: { increment: 1 } },
      }),
    ]);
    return Response.json({ success: true, card }, { status: 201 });
  }),

  DELETE: implement(deleteDeckApi, {}, async ({ params, session }) => {
    const deck = await prisma.flashcardDeck.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    if (!deck || deck.userId !== session.user.id)
      return Response.json({ error: 'Not found' }, { status: 404 });
    await prisma.flashcardDeck.delete({ where: { id: params.id } });
    return { success: true as const };
  }),
});
