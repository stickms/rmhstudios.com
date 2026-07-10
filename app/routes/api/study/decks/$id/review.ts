import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/** GET /api/study/decks/$id/review — the viewer's due cards for this deck. */
export const Route = createFileRoute('/api/study/decks/$id/review')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const deck = await prisma.flashcardDeck.findUnique({
            where: { id: params.id },
            select: { id: true, isPublic: true, userId: true },
          });
          if (!deck) return Response.json({ error: 'Not found' }, { status: 404 });
          if (!deck.isPublic && deck.userId !== userId) return Response.json({ error: 'Not found' }, { status: 404 });

          const cards = await prisma.flashcard.findMany({
            where: { deckId: params.id },
            orderBy: { position: 'asc' },
            select: { id: true, front: true, back: true, reviews: { where: { userId }, select: { dueAt: true } } },
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
        } catch (error) {
          console.error('Review queue error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
