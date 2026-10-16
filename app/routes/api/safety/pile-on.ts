import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { acceptGuard, dismissGuard, getGuard, undoGuard } from '@/lib/safety/pile-on.server';

/**
 * S7 pile-on guard, author side.
 * GET  ?post=<id>                         → the guard's state (404 if not the author's)
 * POST { postId, action: accept|dismiss|undo } → one-tap limit / dismiss / lift early
 */
export const Route = createFileRoute('/api/safety/pile-on')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: z.object({ post: z.string().min(1).max(40) }) },
        async ({ userId, query }) => {
          const g = await getGuard(query.post, userId);
          if (!g) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ status: g.status, expiresAt: g.expiresAt });
        },
      ),
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({
            postId: z.string().min(1).max(40),
            action: z.enum(['accept', 'dismiss', 'undo']),
          }),
        },
        async ({ userId, body }) => {
          if (body.action === 'accept') {
            const expiresAt = await acceptGuard(body.postId, userId);
            if (!expiresAt) return Response.json({ error: 'Nothing to accept' }, { status: 409 });
            return Response.json({ status: 'ACTIVE', expiresAt });
          }
          const ok =
            body.action === 'dismiss'
              ? await dismissGuard(body.postId, userId)
              : await undoGuard(body.postId, userId);
          if (!ok) return Response.json({ error: 'Nothing to change' }, { status: 409 });
          return Response.json({ status: body.action === 'dismiss' ? 'DISMISSED' : 'REVERTED' });
        },
      ),
    },
  },
});
