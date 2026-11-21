import { apiRoute } from '@/lib/api/route.server';
import { badRequest, defineHandler } from '@/lib/api/handler.server';
import { UnknownCardError, applyReviews, loadCards } from '@/lib/rmhmusic/learn/cards.server';
import { recordPractice } from '@/lib/rmhmusic/history.server';
import { reviewBatchSchema } from '@/lib/rmhmusic/learn/schemas';

/**
 * `/api/rmhmusic/learn/cards` — the learner's remembered staff-reading cards. GET lists them
 * (soonest due first, at most 200; never writes). POST reviews a Practice session's answers with
 * the server's clock and returns the touched rows; it pays nothing. A session is one entry in the
 * practice log, not one per card.
 */
export const route = apiRoute('/api/rmhmusic/learn/cards', {
  GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
    Response.json({ cards: await loadCards(userId) }),
  ),

  POST: defineHandler({ rateLimit: 'write', body: reviewBatchSchema }, async ({ userId, body }) => {
    try {
      const cards = await applyReviews(userId, body.reviews, Date.now());
      await recordPractice(userId, { kind: 'cards', refId: 'cards', durationMs: body.durationMs });
      return Response.json({ cards });
    } catch (err) {
      if (err instanceof UnknownCardError) return badRequest('Unknown card');
      throw err;
    }
  }),
});
