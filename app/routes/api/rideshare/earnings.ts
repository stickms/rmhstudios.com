import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { PAYOUT_RATES, payoutBreakdown } from '@/lib/rideshare/geo';

/**
 * Driver earnings summary. Rides are paid, so we split each completed trip's
 * fare into the driver's take-home, RMH Studios' service fee and the insurance
 * contribution, then add tips on top.
 */

/** Aggregate payout split for a batch of completed trips (mirrors {@link payoutBreakdown}). */
function aggregatePayout(grossFaresCents: number, tipsCents: number, trips: number) {
  const serviceFeeCents = Math.round(grossFaresCents * PAYOUT_RATES.serviceFeeRate);
  const insuranceCents = Math.min(
    Math.max(0, grossFaresCents - serviceFeeCents),
    Math.max(trips * PAYOUT_RATES.insuranceMinCents, Math.round(grossFaresCents * PAYOUT_RATES.insuranceRate)),
  );
  const driverBaseCents = Math.max(0, grossFaresCents - serviceFeeCents - insuranceCents);
  return {
    grossFaresCents,
    tipsCents,
    serviceFeeCents,
    insuranceCents,
    driverBaseCents,
    earningsCents: driverBaseCents + tipsCents,
  };
}

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
              _sum: { estimatedFareCents: true, tipCents: true, distanceMeters: true },
            }),
            prisma.ride.aggregate({
              where: { driverId: userId, status: 'COMPLETED', completedAt: { gte: weekAgo } },
              _count: { _all: true },
              _sum: { estimatedFareCents: true, tipCents: true },
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
                tipCents: true,
                completedAt: true,
                ratingByRider: true,
              },
            }),
          ]);

          const allPayout = aggregatePayout(
            allTime._sum.estimatedFareCents ?? 0,
            allTime._sum.tipCents ?? 0,
            allTime._count._all,
          );
          const weekPayout = aggregatePayout(
            week._sum.estimatedFareCents ?? 0,
            week._sum.tipCents ?? 0,
            week._count._all,
          );

          return Response.json({
            totalTrips: allTime._count._all,
            totalDistanceMeters: allTime._sum.distanceMeters ?? 0,
            // Lifetime payout split.
            grossFaresCents: allPayout.grossFaresCents,
            tipsCents: allPayout.tipsCents,
            serviceFeeCents: allPayout.serviceFeeCents,
            insuranceCents: allPayout.insuranceCents,
            earningsCents: allPayout.earningsCents,
            weekTrips: week._count._all,
            weekEarningsCents: weekPayout.earningsCents,
            ratingCount: driver.ratingCount,
            ratingAvg: driver.ratingCount > 0 ? driver.ratingTotal / driver.ratingCount : null,
            // Per-trip take-home for the recent list.
            recent: recent.map((t) => ({
              ...t,
              driverEarningsCents: payoutBreakdown(t.estimatedFareCents, t.tipCents).driverEarningsCents,
            })),
          });
        } catch (error) {
          console.error('Rideshare earnings error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
