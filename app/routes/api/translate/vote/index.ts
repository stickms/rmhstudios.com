import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { toggleVote } from '@/lib/delight/translate.server';

/** POST /api/translate/vote { suggestionId } — toggles the member's vote; not on their own suggestion. */
export const Route = createFileRoute('/api/translate/vote/')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ suggestionId: z.string().min(1).max(40) }) },
        async ({ userId, body }) => {
          const voted = await toggleVote(userId, body.suggestionId);
          if (voted === null)
            return Response.json({ error: 'Cannot vote on that' }, { status: 400 });
          return Response.json({ voted });
        },
      ),
    },
  },
});
