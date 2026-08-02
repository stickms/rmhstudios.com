import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';

const rateSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
});

export const Route = createFileRoute('/api/rideshare/rides/$id/rate')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ request, params, session }) => {
        const userId = session.user.id;

        const parsed = rateSchema.safeParse(await request.json());
        if (!parsed.success) {
          return Response.json({ error: 'Rating must be 1–5.' }, { status: 400 });
        }
        const rating = parsed.data.rating;

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
          return Response.json({ error: 'Ride not found' }, { status: 404 });
        }
        if (ride.status !== 'COMPLETED') {
          return Response.json({ error: 'You can only rate completed trips.' }, { status: 409 });
        }
        const isRider = ride.riderId === userId;
        const isDriver = ride.driverId === userId;
        if (!isRider && !isDriver) {
          return Response.json({ error: 'Not your ride.' }, { status: 403 });
        }

        if (isRider) {
          if (ride.ratingByRider != null) {
            return Response.json({ error: 'You already rated this trip.' }, { status: 409 });
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
            return Response.json({ error: 'You already rated this trip.' }, { status: 409 });
          }
          await prisma.ride.update({ where: { id: ride.id }, data: { ratingByDriver: rating } });
        }

        return Response.json({ ok: true });
      }),
    },
  },
});
