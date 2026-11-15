import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { directionsQuery } from '@/lib/rideshare/rideshare-schema';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidLatLng } from '@/lib/rideshare/geo';
import { routeEstimate } from '@/lib/rideshare/osm.server';
import { estimateFareCents } from '@/lib/rideshare/geo';
import { isRideClassId } from '@/lib/rideshare/classes';

export const route = apiRoute('/api/rideshare/directions', {
  GET: implement(C.rideDirectionsApi, { query: directionsQuery }, async ({ request }) => {
    try {
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
      return Response.json({ error: 'Routing is unavailable right now.' }, { status: 502 });
    }
  }),
});
