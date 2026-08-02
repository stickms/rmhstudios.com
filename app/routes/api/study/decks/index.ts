import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { generateCards } from '@/lib/rmhstudy/tutor.server';
import { listDecks } from '@/lib/study.server';

const createSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  // Optional AI seed: generate starter cards for this topic.
  generateTopic: z.string().max(200).optional(),
});

const MAX_DECKS = 200;

/**
 * GET  /api/study/decks — your decks + popular public decks.
 * POST /api/study/decks — create a deck (optionally AI-seeded).
 */
export const Route = createFileRoute('/api/study/decks/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ session }) => {
        return Response.json(await listDecks(session?.user.id ?? null));
      }),

      POST: defineHandler(
        { body: createSchema, allowEmptyBody: true, verboseValidationErrors: true },
        async ({ request, session, body }) => {
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 15, windowMs: 60_000, prefix: 'deck-create' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const count = await prisma.flashcardDeck.count({ where: { userId } });
          if (count >= MAX_DECKS)
            return Response.json({ error: 'Too many decks' }, { status: 400 });

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
    },
  },
});
