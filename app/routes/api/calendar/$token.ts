import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { FEED_TOKEN_RE } from '@/lib/calendar/feed-token';
import { buildFeedForToken } from '@/lib/calendar/feed.server';

/**
 * GET /api/calendar/<token>.ics — a member's private calendar feed (K3).
 *
 * `auth: 'none'`: calendar apps poll this without cookies, so the unguessable,
 * rotatable token IS the credential. Private + short TTL so no shared cache
 * holds one member's schedule.
 */
export const Route = createFileRoute('/api/calendar/$token')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', cache: { visibility: 'private', maxAge: 300 } },
        async ({ params }) => {
          const token = params.token.replace(/\.ics$/i, '');
          if (!FEED_TOKEN_RE.test(token)) return new Response('Not found', { status: 404 });
          const ics = await buildFeedForToken(token);
          if (!ics) return new Response('Not found', { status: 404 });
          return new Response(ics, {
            headers: {
              'Content-Type': 'text/calendar; charset=utf-8',
              'Content-Disposition': 'inline; filename="rmhstudios.ics"',
            },
          });
        },
      ),
    },
  },
});
