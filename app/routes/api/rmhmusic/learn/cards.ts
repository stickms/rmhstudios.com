import { createFileRoute } from '@tanstack/react-router';
import { badRequest, defineHandler } from '@/lib/api/handler.server';
import { UnknownCardError, applyReviews, loadCards } from '@/lib/rmhmusic/learn/cards.server';
import { reviewBatchSchema } from '@/lib/rmhmusic/learn/schemas';

/**
 * `/api/rmhmusic/learn/cards` — the learner's remembered staff-reading cards. GET lists them
 * (soonest due first, at most 200; never writes). POST reviews a Practice session's answers with
 * the server's clock and returns the touched rows; it pays nothing.
 */
export const Route = createFileRoute('/api/rmhmusic/learn/cards')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json({ cards: await loadCards(userId) }),
      ),

      POST: defineHandler(
        { rateLimit: 'write', body: reviewBatchSchema },
        async ({ userId, body }) => {
          try {
            return Response.json({ cards: await applyReviews(userId, body.reviews, Date.now()) });
          } catch (err) {
            if (err instanceof UnknownCardError) return badRequest('Unknown card');
            throw err;
          }
        },
      ),
    },
  },
});
