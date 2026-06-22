import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/**
 * Driver earnings summary. Rides are free, so actual earnings are $0 — but we
 * surface trip counts, ratings, and the value delivered (the waived fares) so
 * the dashboard is meaningful now and ready for when fares go live.
 */
export const Route = createFileRoute('/api/rideshare/earnings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const userId = session.user.id;

          const driver = await prisma.rideshareDriver.findUnique({
            where: { userId },
            select: { status: true, ratingCount: true, ratingTotal: true },
          });
          if (!driver || driver.status !== 'APPROVED') {
            return Response.json({ error: 'You must be an approved driver.' }, { status: 403 });
          }

          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

          const [allTime, week, recent] = await Promise.all([
            prisma.ride.aggregate({
              where: { driverId: userId, status: 'COMPLETED' },
              _count: { _all: true },
              _sum: { estimatedFareCents: true, distanceMeters: true },
            }),
            prisma.ride.aggregate({
              where: { driverId: userId, status: 'COMPLETED', completedAt: { gte: weekAgo } },
              _count: { _all: true },
              _sum: { estimatedFareCents: true },
            }),
            prisma.ride.findMany({
              where: { driverId: userId, status: 'COMPLETED' },
              orderBy: { completedAt: 'desc' },
              take: 5,
              select: {
                id: true,
                rideClass: true,
                pickupLabel: true,
                dropoffLabel: true,
                distanceMeters: true,
                estimatedFareCents: true,
                completedAt: true,
                ratingByRider: true,
              },
            }),
          ]);

          return Response.json({
            totalTrips: allTime._count._all,
            totalDistanceMeters: allTime._sum.distanceMeters ?? 0,
            grossWaivedCents: allTime._sum.estimatedFareCents ?? 0,
            weekTrips: week._count._all,
            weekWaivedCents: week._sum.estimatedFareCents ?? 0,
            // Rides are free for now.
            earningsCents: 0,
            ratingCount: driver.ratingCount,
            ratingAvg: driver.ratingCount > 0 ? driver.ratingTotal / driver.ratingCount : null,
            recent,
          });
        } catch (error) {
          console.error('Rideshare earnings error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
