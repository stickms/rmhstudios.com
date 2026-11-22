import { refusalBody, refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createDeckApi, listDecksApi } from '@/lib/study/decks.contract';
import { createDeckBody, listDecksQuery } from '@/lib/study/decks-schema';
import { atDeckCap, createDeck } from '@/lib/study/deck-editor.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateCards } from '@/lib/rmhstudy/tutor.server';
import { listDecks } from '@/lib/study.server';

/**
 * GET  /api/study/decks — your decks + popular public decks.
 * POST /api/study/decks — create a deck (optionally AI-seeded).
 */
export const route = apiRoute('/api/study/decks', {
  GET: implement(listDecksApi, { auth: 'optional', query: listDecksQuery }, async ({ session, query }) => {
    return await listDecks(session?.user.id ?? null, query.tz);
  }),

  POST: implement(
    createDeckApi,
    { body: createDeckBody, allowEmptyBody: true, verboseValidationErrors: true },
    async ({ request, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed } = rateLimit(ip, { limit: 15, windowMs: 60_000, prefix: 'deck-create' });
      if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

      if (await atDeckCap(userId)) return Response.json({ ...refusalBody('STUDY_DECK_LIMIT') }, { status: 400 });

      // Optionally seed with AI-generated cards.
      let cards: { front: string; back: string }[] = [];
      if (body.generateTopic) {
        cards = await generateCards(body.generateTopic, 8);
      }

      // The deck cap and the insert run under one per-member lock.
      const created = await createDeck(userId, {
        title: body.title,
        description: body.description,
        isPublic: body.isPublic,
        cards,
      });
      if (!created.ok) return Response.json({ error: created.error, ...refusalCodeOf(created) }, { status: created.status });
      const deck = created;

      return Response.json(
        { success: true, id: deck.id, generated: cards.length },
        { status: 201 },
      );
    },
  ),
});
