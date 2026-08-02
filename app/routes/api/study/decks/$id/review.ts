import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

/** GET /api/study/decks/$id/review — the viewer's due cards for this deck. */
export const Route = createFileRoute('/api/study/decks/$id/review')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ params, session }) => {
        const userId = session.user.id;

        const deck = await prisma.flashcardDeck.findUnique({
          where: { id: params.id },
          select: { id: true, isPublic: true, userId: true },
        });
        if (!deck) return Response.json({ error: 'Not found' }, { status: 404 });
        if (!deck.isPublic && deck.userId !== userId)
          return Response.json({ error: 'Not found' }, { status: 404 });

        const cards = await prisma.flashcard.findMany({
          where: { deckId: params.id },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            front: true,
            back: true,
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
          .map((c) => ({ id: c.id, front: c.front, back: c.back }));

        return Response.json({ due });
      }),
    },
  },
});
