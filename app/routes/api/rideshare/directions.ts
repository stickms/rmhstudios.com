import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidLatLng } from '@/lib/rideshare/geo';
import { routeEstimate } from '@/lib/rideshare/osm.server';
import { estimateFareCents } from '@/lib/rideshare/geo';
import { isRideClassId } from '@/lib/rideshare/classes';

export const Route = createFileRoute('/api/rideshare/directions')({
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
            limit: 40,
            windowMs: 60_000,
            prefix: 'rideshare-directions',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests. Please slow down.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const params = new URL(request.url).searchParams;
          const pickup = {
            lat: Number(params.get('fromLat')),
            lng: Number(params.get('fromLng')),
          };
          const dropoff = {
            lat: Number(params.get('toLat')),
            lng: Number(params.get('toLng')),
          };
          if (!isValidLatLng(pickup) || !isValidLatLng(dropoff)) {
            return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
          }

          const rideClass = params.get('class');
          const estimate = await routeEstimate(pickup, dropoff);
          const fareCents =
            rideClass && isRideClassId(rideClass)
              ? estimateFareCents(estimate.distanceMeters, rideClass)
              : null;

          return Response.json({
            distanceMeters: estimate.distanceMeters,
            durationSeconds: estimate.durationSeconds,
            precise: estimate.precise,
            geometry: estimate.geometry ?? null,
            fareCents,
          });
        } catch (error) {
          console.error('Rideshare directions error:', error);
          return Response.json(
            { error: 'Routing is unavailable right now.' },
            { status: 502 },
          );
        }
      },
    },
  },
});
