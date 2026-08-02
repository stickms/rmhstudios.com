import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { getDeck } from '@/lib/study.server';

const addCardSchema = z.object({
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(500),
});

/**
 * GET    /api/study/decks/$id — deck detail with cards (owner or public).
 * POST   /api/study/decks/$id — add a card (owner).
 * DELETE /api/study/decks/$id — delete the deck (owner).
 */
export const Route = createFileRoute('/api/study/decks/$id/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const detail = await getDeck(params.id, { id: session?.user?.id ?? null });
        if (!detail) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(detail);
      }),

      POST: defineHandler({}, async ({ request, params, session }) => {
        const deck = await prisma.flashcardDeck.findUnique({
          where: { id: params.id },
          select: { userId: true, cardCount: true },
        });
        if (!deck || deck.userId !== session.user.id)
          return Response.json({ error: 'Not found' }, { status: 404 });
        if (deck.cardCount >= 1000)
          return Response.json({ error: 'Deck is full' }, { status: 400 });

        const body = await request.json().catch(() => ({}));
        const parsed = addCardSchema.safeParse(body);
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

      DELETE: defineHandler({}, async ({ params, session }) => {
        const deck = await prisma.flashcardDeck.findUnique({
          where: { id: params.id },
          select: { userId: true },
        });
        if (!deck || deck.userId !== session.user.id)
          return Response.json({ error: 'Not found' }, { status: 404 });
        await prisma.flashcardDeck.delete({ where: { id: params.id } });
        return Response.json({ success: true });
      }),
    },
  },
});
