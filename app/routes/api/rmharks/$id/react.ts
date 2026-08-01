import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { isValidReactionEmoji } from '@/lib/social/reactions';
import { togglePostReaction } from '@/lib/social/reactions.server';

/** POST /api/rmharks/$id/react — toggle an emoji reaction on a post. */
export const Route = createFileRoute('/api/rmharks/$id/react')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'reaction' } },
        async ({ request, params, session }) => {
          const { id } = params;
          const userId = session.user.id;

          const body = await request.json().catch(() => null);
          const parsed = z.object({ emoji: z.string().min(1).max(32) }).safeParse(body);
          if (!parsed.success || !isValidReactionEmoji(parsed.data.emoji)) {
            return Response.json({ error: 'Invalid emoji' }, { status: 400 });
          }

          const result = await togglePostReaction(userId, id, parsed.data.emoji);
          if (!result.found) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ success: true, reacted: result.reacted, reactions: result.rows });
        },
      ),
    },
  },
});
