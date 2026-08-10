import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getCalendarState } from '@/lib/pf2ecal/sessions.server';

/**
 * GET /api/pf2ecal — the whole board in one response.
 *
 * `auth: 'optional'` because the page is readable without an account and only
 * *writes* need a session; the response still varies by viewer (it carries
 * `viewerId` so the client can highlight your own answer), which is why the
 * cache is `private`. A `public` declaration here would be rejected at module
 * load, and rightly — a shared cache would hand one player's identity to the
 * next.
 */
export const Route = createFileRoute('/api/pf2ecal/')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'optional',
          rateLimit: 'read',
          // Short and revalidating rather than zero: the page refetches on
          // focus and after every mutation, so a few seconds of browser
          // freshness absorbs a burst of tab-switching without ever being the
          // reason someone sees a stale RSVP.
          cache: { visibility: 'private', maxAge: 5, staleWhileRevalidate: 30 },
        },
        async ({ user, userId }) =>
          Response.json(
            await getCalendarState(userId ? { id: userId, name: user?.name ?? null } : null),
          ),
      ),
    },
  },
});
