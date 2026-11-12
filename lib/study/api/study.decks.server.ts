import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createDeckApi, listDecksApi } from '@/lib/study/decks.contract';
import { createDeckBody } from '@/lib/study/decks-schema';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateCards } from '@/lib/rmhstudy/tutor.server';
import { listDecks } from '@/lib/study.server';

const MAX_DECKS = 200;

/**
 * GET  /api/study/decks — your decks + popular public decks.
 * POST /api/study/decks — create a deck (optionally AI-seeded).
 */
export const route = apiRoute('/api/study/decks', {
  GET: implement(listDecksApi, { auth: 'optional' }, async ({ session }) => {
    return await listDecks(session?.user.id ?? null);
  }),

  POST: implement(
    createDeckApi,
    { body: createDeckBody, allowEmptyBody: true, verboseValidationErrors: true },
    async ({ request, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed } = rateLimit(ip, { limit: 15, windowMs: 60_000, prefix: 'deck-create' });
      if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

      const count = await prisma.flashcardDeck.count({ where: { userId } });
      if (count >= MAX_DECKS) return Response.json({ error: 'Too many decks' }, { status: 400 });

      // Optionally seed with AI-generated cards.
      let cards: { front: string; back: string }[] = [];
      if (body.generateTopic) {
        cards = await generateCards(body.generateTopic, 8);
      }

      const deck = await prisma.flashcardDeck.create({
        data: {
          userId,
          title: body.title.trim(),
          description: body.description?.trim() || null,
          isPublic: body.isPublic ?? false,
          cardCount: cards.length,
          cards: cards.length
            ? { create: cards.map((c, i) => ({ front: c.front, back: c.back, position: i })) }
            : undefined,
        },
        select: { id: true },
      });

      return Response.json(
        { success: true, id: deck.id, generated: cards.length },
        { status: 201 },
      );
    },
  ),
});
