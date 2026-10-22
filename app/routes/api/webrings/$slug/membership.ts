import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { joinRing, leaveRing } from '@/lib/profile/webrings.server';

/**
 * POST   /api/webrings/$slug/membership — join a ring (P6).
 * DELETE /api/webrings/$slug/membership — leave it.
 * Joining puts the ring's strip on the caller's profile; leaving the last ring
 * takes it off again.
 */
const limit = { limit: 20, windowMs: 60_000, prefix: 'webring-membership' };

export const Route = createFileRoute('/api/webrings/$slug/membership')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: limit }, async ({ params, userId }) => {
        const result = await joinRing(userId, params.slug);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ success: true });
      }),
      DELETE: defineHandler({ rateLimit: limit }, async ({ params, userId }) => {
        await leaveRing(userId, params.slug);
        return Response.json({ success: true });
      }),
    },
  },
});
