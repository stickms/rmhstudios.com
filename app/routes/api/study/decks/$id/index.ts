import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';

const addCardSchema = z.object({ front: z.string().min(1).max(500), back: z.string().min(1).max(500) });

/**
 * GET    /api/study/decks/$id — deck detail with cards (owner or public).
 * POST   /api/study/decks/$id — add a card (owner).
 * DELETE /api/study/decks/$id — delete the deck (owner).
 */
export const Route = createFileRoute('/api/study/decks/$id/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const deck = await prisma.flashcardDeck.findUnique({
            where: { id: params.id },
            select: {
              id: true, title: true, description: true, isPublic: true, userId: true, cardCount: true,
              cards: { orderBy: { position: 'asc' }, select: { id: true, front: true, back: true } },
            },
          });
          if (!deck) return Response.json({ error: 'Not found' }, { status: 404 });
          const isOwner = session?.user?.id === deck.userId;
          if (!deck.isPublic && !isOwner) return Response.json({ error: 'Not found' }, { status: 404 });

          // Count due cards for this viewer.
          let dueCount = 0;
          if (session) {
            const cardIds = deck.cards.map((c) => c.id);
            const reviewed = await prisma.flashcardReview.findMany({
              where: { userId: session.user.id, cardId: { in: cardIds } },
              select: { cardId: true, dueAt: true },
            });
            const reviewedMap = new Map(reviewed.map((r) => [r.cardId, r.dueAt]));
            const now = Date.now();
            for (const c of deck.cards) {
              const due = reviewedMap.get(c.id);
              if (!due || due.getTime() <= now) dueCount++;
            }
          }

          return Response.json({
            deck: { id: deck.id, title: deck.title, description: deck.description, isPublic: deck.isPublic, isOwner, cardCount: deck.cardCount },
            cards: isOwner ? deck.cards : deck.cards.map((c) => ({ id: c.id, front: c.front, back: c.back })),
            dueCount,
            signedIn: !!session,
          });
        } catch (error) {
          console.error('Deck detail error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const deck = await prisma.flashcardDeck.findUnique({ where: { id: params.id }, select: { userId: true, cardCount: true } });
          if (!deck || deck.userId !== session.user.id) return Response.json({ error: 'Not found' }, { status: 404 });
          if (deck.cardCount >= 1000) return Response.json({ error: 'Deck is full' }, { status: 400 });

          const body = await request.json().catch(() => ({}));
          const parsed = addCardSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid card' }, { status: 400 });

          const [card] = await prisma.$transaction([
            prisma.flashcard.create({
              data: { deckId: params.id, front: parsed.data.front.trim(), back: parsed.data.back.trim(), position: deck.cardCount },
              select: { id: true, front: true, back: true },
            }),
            prisma.flashcardDeck.update({ where: { id: params.id }, data: { cardCount: { increment: 1 } } }),
          ]);
          return Response.json({ success: true, card }, { status: 201 });
        } catch (error) {
          console.error('Add card error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const deck = await prisma.flashcardDeck.findUnique({ where: { id: params.id }, select: { userId: true } });
          if (!deck || deck.userId !== session.user.id) return Response.json({ error: 'Not found' }, { status: 404 });
          await prisma.flashcardDeck.delete({ where: { id: params.id } });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Delete deck error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
