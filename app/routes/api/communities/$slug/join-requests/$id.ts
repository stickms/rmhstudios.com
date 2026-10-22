import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { requireMod } from '@/lib/communities/guard.server';
import { decideRequest } from '@/lib/communities/join-requests.server';

/**
 * POST /api/communities/$slug/join-requests/$id { decision: 'approve' | 'deny' } —
 * decide a pending request (owner and moderators). Approving creates the
 * membership in the same transaction; a request already decided answers 404.
 */
export const Route = createFileRoute('/api/communities/$slug/join-requests/$id')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ decision: z.enum(['approve', 'deny']) }) },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          if (!/^\d{1,18}$/.test(params.id)) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
          const result = await decideRequest(guard.value, BigInt(params.id), userId, body.decision);
          if (!result.ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ success: true, decision: result.decision });
        },
      ),
    },
  },
});
