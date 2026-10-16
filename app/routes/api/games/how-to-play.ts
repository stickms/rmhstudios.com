import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { aiAvailable, howToPlay } from '@/lib/devplatform/ai.server';

const schema = z.object({
  gameId: z.string().trim().min(1).max(64),
  question: z.string().trim().min(2).max(400),
});

/** POST /api/games/how-to-play — rules Q&A grounded in the game's catalog text (I1). */
export const Route = createFileRoute('/api/games/how-to-play')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'ai', body: schema }, async ({ body }) => {
        if (!aiAvailable()) return Response.json({ error: 'AI is not available' }, { status: 503 });
        const answer = await howToPlay(body.gameId, body.question).catch(() => null);
        if (!answer)
          return Response.json({ error: 'No answer available right now' }, { status: 502 });
        return Response.json({ answer });
      }),
    },
  },
});
