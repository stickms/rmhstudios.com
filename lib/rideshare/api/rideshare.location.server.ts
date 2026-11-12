import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { driverLocationBody } from '@/lib/rideshare/rideshare-schema';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidLatLng } from '@/lib/rideshare/geo';

/**
 * Driver location heartbeat. Approved drivers post their position while on an
 * active trip; the rider sees it on the trip map via the sync endpoint.
 */
export const route = apiRoute('/api/rideshare/location', {
  POST: implement(
    C.shareDriverLocationApi,
    {
      body: driverLocationBody,
      invalid: () => Response.json({ error: 'Invalid coordinates' }, { status: 400 }),
    },
    async ({ request, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed } = rateLimit(ip, {
        limit: 20,
        windowMs: 60_000,
        prefix: 'rideshare-location',
      });
      if (!allowed) {
        return Response.json({ ok: true, throttled: true });
      }

      if (!isValidLatLng(body)) {
        return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
      }

      const result = await prisma.rideshareDriver.updateMany({
        where: { userId, status: 'APPROVED' },
        data: {
          lastLat: body.lat,
          lastLng: body.lng,
          locationUpdatedAt: new Date(),
        },
      });
      if (result.count === 0) {
        return Response.json({ error: 'Not an approved driver.' }, { status: 403 });
      }

      return Response.json({ ok: true });
    },
  ),
});
