/**
 * GET /api/account/standing — the signed-in user's own moderation record:
 * strike history, active count, ban state, and each strike's appeal status.
 *
 * Self-only by construction: the user id comes from the session, never from the
 * request, so there is no parameter that could be pointed at somebody else.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { withRateLimit } from '@/lib/rate-limit';
import { getAccountStanding } from '@/lib/moderation/standing.server';

export const Route = createFileRoute('/api/account/standing')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ request, session }) => {
        const limited = withRateLimit(request, 'read', { scope: session.user.id });
        if (limited) return limited;

        const standing = await getAccountStanding(session.user.id);
        return Response.json(standing, {
          // A moderation record is per-user and changes the moment a
          // moderator acts — never let a shared cache hold it.
          headers: { 'Cache-Control': 'private, no-store' },
        });
      }),
    },
  },
});
