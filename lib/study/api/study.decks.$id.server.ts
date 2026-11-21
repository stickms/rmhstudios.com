import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  addDeckCardApi,
  deleteDeckApi,
  getDeckApi,
  updateDeckApi,
} from '@/lib/study/decks.contract';
import { addCardBody, updateDeckBody } from '@/lib/study/decks-schema';
import { updateDeck } from '@/lib/study/deck-editor.server';
import { MAX_DECK_CARDS } from '@/lib/study/limits';
import { prisma } from '@/lib/prisma.server';
import { getDeck } from '@/lib/study.server';

/**
 * GET    /api/study/decks/$id — deck detail with cards (owner or public).
 * POST   /api/study/decks/$id — add a card (owner).
 * PATCH  /api/study/decks/$id — title, description, public (owner).
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
    if (deck.cardCount >= MAX_DECK_CARDS) return Response.json({ error: 'Deck is full' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const parsed = addCardBody.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid card' }, { status: 400 });

    // After the current last card: a deleted card leaves a gap, so the count is not the next slot.
    const last = await prisma.flashcard.aggregate({
      where: { deckId: params.id },
      _max: { position: true },
    });
    const [card] = await prisma.$transaction([
      prisma.flashcard.create({
        data: {
          deckId: params.id,
          front: parsed.data.front.trim(),
          back: parsed.data.back.trim(),
          position: (last._max.position ?? -1) + 1,
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

  PATCH: implement(
    updateDeckApi,
    { rateLimit: 'write', body: updateDeckBody },
    async ({ userId, params, body }) => {
      const result = await updateDeck(userId, params.id, body);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return { success: true as const };
    },
  ),

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
