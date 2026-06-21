import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateWeeklyRecap } from '@/lib/ai/recap.server';

// Cache per user so re-opening doesn't re-bill the model.
const cache = new Map<string, { recap: unknown; at: number }>();
const TTL_MS = 60 * 60 * 1000;

/** GET /api/recap — the signed-in user's "week on RMH" recap. */
export const Route = createFileRoute('/api/recap')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'recap' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const cached = cache.get(session.user.id);
          if (cached && Date.now() - cached.at < TTL_MS) {
            return Response.json(cached.recap as object);
          }
          const recap = await generateWeeklyRecap(session.user.id);
          cache.set(session.user.id, { recap, at: Date.now() });
          return Response.json(recap);
        } catch (error) {
          console.error('Recap error:', error);
          return Response.json({ error: 'Could not generate recap' }, { status: 500 });
        }
      },
    },
  },
});
