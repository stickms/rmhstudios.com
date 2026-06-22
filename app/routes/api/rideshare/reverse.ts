import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidLatLng } from '@/lib/rideshare/geo';
import { reverseGeocode } from '@/lib/rideshare/osm.server';

/**
 * Reverse-geocode the rider's current GPS position into an address label so
 * "Use current location" can fill the pickup/drop-off field.
 */
export const Route = createFileRoute('/api/rideshare/reverse')({
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
            prefix: 'rideshare-reverse',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests. Please slow down.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const params = new URL(request.url).searchParams;
          const lat = Number(params.get('lat'));
          const lng = Number(params.get('lng'));
          if (!isValidLatLng({ lat, lng })) {
            return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
          }

          const label = await reverseGeocode(lat, lng);
          if (!label) {
            return Response.json({ error: 'Could not find an address here.' }, { status: 404 });
          }
          return Response.json({ label, lat, lng });
        } catch (error) {
          console.error('Rideshare reverse error:', error);
          return Response.json(
            { error: 'Location lookup is unavailable right now.' },
            { status: 502 },
          );
        }
      },
    },
  },
});
