/**
 * RMHHomes — location autocomplete API.
 *
 * GET /api/homes/geocode?q=Rochester
 *
 * Thin wrapper over the free OSM Nominatim geocoder (cached server-side), used
 * by the location search box.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { geocode } from '@/lib/homes/geo.server';
import { homesGeocodeApi } from '@/lib/homes/homes.contract';

export const route = apiRoute('/api/homes/geocode', {
  GET: implement(
    homesGeocodeApi,
    {
      rateLimit: {
        limit: 30,
        windowMs: 60_000,
        prefix: 'homes-geocode',
        message: 'Too many searches. Please slow down.',
      },
    },
    async ({ request }) => {
      const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
      if (q.length < 3) {
        return { results: [] };
      }
      try {
        return { results: await geocode(q, 5) };
      } catch (error) {
        console.error('Homes geocode error:', error);
        return Response.json(
          { error: 'Location search is unavailable right now.' },
          { status: 502 },
        );
      }
    },
  ),
});
