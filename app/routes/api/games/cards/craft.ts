import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { craftBadgeApi } from '@/lib/cards/steam.contract';
import { craftBadgeBody } from '@/lib/cards/steam-schema';
import { craftBadge } from '@/lib/cards/cards.server';

/** POST /api/games/cards/craft — craft or level a title's badge from one set of its cards. */
export const Route = createFileRoute('/api/games/cards/craft')({
  server: {
    handlers: {
      POST: implement(
        craftBadgeApi,
        {
          rateLimit: 'write',
          body: craftBadgeBody,
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
