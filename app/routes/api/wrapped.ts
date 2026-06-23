import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateYearlyWrapped } from '@/lib/wrapped/wrapped.server';

// Cache per user+year so re-opening doesn't re-aggregate/re-bill the model.
const cache = new Map<string, { wrapped: unknown; at: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;

/** GET /api/wrapped?year= — the signed-in user's year-in-review. */
export const Route = createFileRoute('/api/wrapped')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'wrapped' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const url = new URL(request.url);
          const now = new Date();
          const requested = parseInt(url.searchParams.get('year') || '', 10);
          // Clamp to a sane range; default to the current year.
          const year =
            Number.isFinite(requested) && requested >= 2020 && requested <= now.getUTCFullYear()
              ? requested
              : now.getUTCFullYear();

          const key = `${session.user.id}:${year}`;
          const cached = cache.get(key);
          if (cached && Date.now() - cached.at < TTL_MS) {
            return Response.json(cached.wrapped as object);
          }
          const wrapped = await generateYearlyWrapped(session.user.id, year);
          cache.set(key, { wrapped, at: Date.now() });
          return Response.json(wrapped);
        } catch (error) {
          console.error('Wrapped error:', error);
          return Response.json({ error: 'Could not generate Wrapped' }, { status: 500 });
        }
      },
    },
  },
});
