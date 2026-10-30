import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { craftBadge } from '@/lib/cards/cards.server';

/** POST /api/games/cards/craft — craft or level a title's badge from one set of its cards. */
export const Route = createFileRoute('/api/games/cards/craft')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({ gameId: z.string().min(1).max(64), foil: z.boolean().default(false) }),
        },
        async ({ userId, body }) => {
          const result = await craftBadge(userId, body.gameId, body.foil);
          if (!result.ok) {
            return Response.json(
              { error: result.reason },
              { status: result.reason === 'unknown-title' ? 404 : 409 },
            );
          }
          return Response.json(result);
        },
      ),
    },
  },
});
