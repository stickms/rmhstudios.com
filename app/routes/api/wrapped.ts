import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getYearlyWrapped } from '@/lib/wrapped.server';

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

          const wrapped = await getYearlyWrapped(session.user.id, year);
          return Response.json(wrapped);
        } catch (error) {
          console.error('Wrapped error:', error);
          return Response.json({ error: 'Could not generate Wrapped' }, { status: 500 });
        }
      },
    },
  },
});
