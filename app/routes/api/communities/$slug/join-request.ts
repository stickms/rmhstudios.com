import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { communityWithRole } from '@/lib/communities/guard.server';
import {
  JOIN_REQUEST_MESSAGE_MAX,
  cancelRequest,
  requestToJoin,
} from '@/lib/communities/join-requests.server';

const requestSchema = z.object({ message: z.string().trim().max(JOIN_REQUEST_MESSAGE_MAX).optional() });

/**
 * POST   /api/communities/$slug/join-request — ask to join a private community
 *        (optional message). Idempotent while pending; a denied user may ask again
 *        after a cooldown.
 * DELETE /api/communities/$slug/join-request — withdraw your pending request.
 */
export const Route = createFileRoute('/api/communities/$slug/join-request')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 60 * 60 * 1000, prefix: 'community-join-request', scope: 'user' },
          body: requestSchema,
          allowEmptyBody: true,
        },
        async ({ params, session, body }) => {
          const ctx = await communityWithRole(params.slug, session.user.id);
          if (!ctx) return Response.json({ error: 'Not found' }, { status: 404 });
          if (!ctx.isPrivate) {
            return Response.json({ error: 'This community is open: just join it' }, { status: 400 });
          }
          const result = await requestToJoin(
            ctx,
            session.user.id,
            session.user.name ?? null,
            body?.message ?? null,
          );
          if (result.ok) return Response.json({ success: true, status: result.status });
          if (result.reason === 'member') {
            return Response.json({ error: 'You are already a member' }, { status: 409 });
          }
          return Response.json(
            { error: 'You can ask again later', retryAt: result.retryAt },
            { status: 429 },
          );
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params, session }) => {
        const ctx = await communityWithRole(params.slug, session.user.id);
        if (!ctx) return Response.json({ error: 'Not found' }, { status: 404 });
        await cancelRequest(ctx.id, session.user.id);
        return Response.json({ success: true });
      }),
    },
  },
});
