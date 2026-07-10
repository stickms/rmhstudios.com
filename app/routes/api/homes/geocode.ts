/**
 * RMHHomes — location autocomplete API.
 *
 * GET /api/homes/geocode?q=Rochester
 *
 * Thin wrapper over the free OSM Nominatim geocoder (cached server-side), used
 * by the location search box.
 */
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { geocode } from '@/lib/homes/geo.server';

export const Route = createFileRoute('/api/homes/geocode')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 30,
            windowMs: 60_000,
            prefix: 'homes-geocode',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many searches. Please slow down.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
          if (q.length < 3) {
            return Response.json({ results: [] });
          }

          const results = await geocode(q, 5);
          return Response.json({ results });
        } catch (error) {
          console.error('Homes geocode error:', error);
          return Response.json(
            { error: 'Location search is unavailable right now.' },
            { status: 502 },
          );
        }
      },
    },
  },
});
