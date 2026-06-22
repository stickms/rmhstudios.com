import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidLatLng } from '@/lib/rideshare/geo';

const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

/**
 * Driver location heartbeat. Approved drivers post their position while on an
 * active trip; the rider sees it on the trip map via the sync endpoint.
 */
export const Route = createFileRoute('/api/rideshare/location')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
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

          const parsed = locationSchema.safeParse(await request.json());
          if (!parsed.success || !isValidLatLng(parsed.data)) {
            return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
          }

          const result = await prisma.rideshareDriver.updateMany({
            where: { userId, status: 'APPROVED' },
            data: {
              lastLat: parsed.data.lat,
              lastLng: parsed.data.lng,
              locationUpdatedAt: new Date(),
            },
          });
          if (result.count === 0) {
            return Response.json({ error: 'Not an approved driver.' }, { status: 403 });
          }

          return Response.json({ ok: true });
        } catch (error) {
          console.error('Rideshare location error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
