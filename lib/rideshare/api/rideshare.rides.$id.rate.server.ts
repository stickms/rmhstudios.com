import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { rateRideBody } from '@/lib/rideshare/rideshare-schema';
import { prisma } from '@/lib/prisma.server';
import { refuse } from '@/lib/rideshare/safety.server';

export const route = apiRoute('/api/rideshare/rides/$id/rate', {
  POST: implement(
    C.rateRideApi,
    {
      body: rateRideBody,
      invalid: () => refuse('INVALID_INPUT'),
    },
    async ({ params, session, body }) => {
      const userId = session.user.id;

      const rating = body.rating;

      const ride = await prisma.ride.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          riderId: true,
          driverId: true,
          status: true,
          ratingByRider: true,
          ratingByDriver: true,
        },
      });
      if (!ride) {
        return refuse('NOT_FOUND');
      }
      if (ride.status !== 'COMPLETED') {
        return refuse('RIDE_NOT_READY');
      }
      const isRider = ride.riderId === userId;
      const isDriver = ride.driverId === userId;
      if (!isRider && !isDriver) {
        return refuse('FORBIDDEN');
      }

      if (isRider) {
        if (ride.ratingByRider != null) {
          return refuse('CONFLICT');
        }
        // Record the rider's rating and roll it into the driver's aggregate.
        await prisma.$transaction([
          prisma.ride.update({ where: { id: ride.id }, data: { ratingByRider: rating } }),
          ...(ride.driverId
            ? [
                prisma.rideshareDriver.update({
                  where: { userId: ride.driverId },
                  data: { ratingCount: { increment: 1 }, ratingTotal: { increment: rating } },
                }),
              ]
            : []),
        ]);
      } else {
        if (ride.ratingByDriver != null) {
          return refuse('CONFLICT');
        }
        await prisma.ride.update({ where: { id: ride.id }, data: { ratingByDriver: rating } });
      }

      return Response.json({ ok: true });
    },
  ),
});
