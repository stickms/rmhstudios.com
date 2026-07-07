/**
 * RMHHomes — favorite toggle.
 *
 *   POST   /api/homes/listings/$id/favorite   → favorite
 *   DELETE /api/homes/listings/$id/favorite   → unfavorite
 */
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { favorite, unfavorite } from '@/lib/homes/listings.server';

export const Route = createFileRoute('/api/homes/listings/$id/favorite')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, {
            limit: 60,
            windowMs: 60_000,
            prefix: 'homes-favorite',
          });
          if (!allowed) return Response.json({ error: 'Too many requests.' }, { status: 429 });

          const ok = await favorite(session.user.id, params.id);
          if (!ok) return Response.json({ error: 'Listing not found' }, { status: 404 });
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Homes favorite POST error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          await unfavorite(session.user.id, params.id);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Homes favorite DELETE error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
