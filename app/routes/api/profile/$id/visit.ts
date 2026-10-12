import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getClientIp } from '@/lib/rate-limit';
import { readVisitCount, recordProfileVisit } from '@/lib/profile/plus.server';

/**
 * POST /api/profile/$id/visit — count a visit for the retro counter (P9) and
 * return the running total. Fired by the counter module AFTER the profile has
 * rendered, so it can never block the page.
 *
 * Counted at most once per visitor per UTC day (`recordProfileVisit`); the
 * profile's own owner and obvious crawlers are never counted. A profile that has
 * not switched the counter on records nothing and answers 404. `$id` is the user
 * id.
 */
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless/i;

export const Route = createFileRoute('/api/profile/$id/visit')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'optional',
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'profile-visit' },
        },
        async ({ request, params, userId }) => {
          const ua = request.headers.get('user-agent') ?? '';
          const own = userId !== null && userId === params.id;
          const bot = ua === '' || BOT_UA.test(ua);
          if (own || bot) {
            const count = await readVisitCount(params.id);
            return count === null
              ? Response.json({ error: 'Not found' }, { status: 404 })
              : Response.json({ count });
          }
          // Signed-in visitors are keyed by account; everyone else by IP + browser.
          const key = userId ? `u:${userId}` : `ip:${getClientIp(request)}|${ua.slice(0, 120)}`;
          const result = await recordProfileVisit(params.id, key);
          if (!result) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ count: result.count });
        },
      ),
    },
  },
});
