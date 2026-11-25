import { notice } from '@/lib/notifications/notice-keys';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { rideActionBody } from '@/lib/rideshare/rideshare-schema';
import { prisma } from '@/lib/prisma.server';
import { notifyRider, notifyDriver } from '@/lib/rideshare/notify.server';
import { formatUsd } from '@/lib/rideshare/geo';
import { refuse, rideBlockedWith } from '@/lib/rideshare/safety.server';

export const route = apiRoute('/api/rideshare/rides/$id', {
  POST: implement(
    C.rideActionApi,
    {
      body: rideActionBody,
      invalid: () => refuse('INVALID_INPUT'),
    },
    async ({ params, session, body }) => {
      const userId = session.user.id;
      const rideId = params.id;

      const { action } = body;

      const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        select: {
          id: true,
          riderId: true,
          driverId: true,
          status: true,
          rideClass: true,
          tipCents: true,
        },
      });
      if (!ride) {
        return refuse('NOT_FOUND');
      }

      if (action === 'accept') {
        if (ride.riderId === userId) {
          return refuse('FORBIDDEN');
        }
        const [driver, account] = await Promise.all([
          prisma.rideshareDriver.findUnique({ where: { userId }, select: { status: true } }),
          prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } }),
        ]);
        if (!driver || driver.status !== 'APPROVED') {
          return refuse('RIDE_DRIVER_NOT_APPROVED');
        }
        // A banned driver cannot accept, whatever their approval says.
        if (account?.bannedUntil && account.bannedUntil.getTime() > Date.now()) {
          return refuse('RIDE_DRIVER_NOT_APPROVED');
        }
        // Blocked either way: one sentence, whoever blocked whom. A failed lookup fails the request.
        if (await rideBlockedWith(ride.riderId, userId)) {
          return refuse('RIDE_BLOCKED');
        }
        // Guard against races: only claim if still open. Scheduled rides
        // are claimable once they enter the 60-minute lead window.
        const leadDate = new Date(Date.now() + 60 * 60 * 1000);
        const result = await prisma.ride.updateMany({
          where: {
            id: rideId,
            driverId: null,
            OR: [{ status: 'REQUESTED' }, { status: 'SCHEDULED', scheduledFor: { lte: leadDate } }],
          },
          data: { driverId: userId, status: 'ACCEPTED', acceptedAt: new Date() },
        });
        if (result.count === 0) {
          return refuse('RIDE_NOT_READY');
        }
        const me = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        await notifyRider(
          ride.riderId,
          userId,
          ride,
          notice('ride-accepted', { driver: me?.name ?? 'Your driver' }),
        );
      } else if (action === 'start') {
        if (ride.driverId !== userId) {
          return refuse('FORBIDDEN');
        }
        const result = await prisma.ride.updateMany({
          where: { id: rideId, driverId: userId, status: 'ACCEPTED' },
          data: { status: 'IN_PROGRESS' },
        });
        if (result.count === 0) {
          return refuse('RIDE_NOT_READY');
        }
        await notifyRider(ride.riderId, userId, ride, notice('ride-started', {}));
      } else if (action === 'complete') {
        if (ride.driverId !== userId) {
          return refuse('FORBIDDEN');
        }
        const result = await prisma.ride.updateMany({
          where: { id: rideId, driverId: userId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        if (result.count === 0) {
          return refuse('RIDE_NOT_READY');
        }
        await notifyRider(
          ride.riderId,
          userId,
          ride,
          notice('ride-complete', {}),
        );
      } else if (action === 'cancel') {
        const isRider = ride.riderId === userId;
        const isDriver = ride.driverId === userId;
        if (!isRider && !isDriver) {
          return refuse('FORBIDDEN');
        }
        if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
          return refuse('RIDE_CLOSED');
        }
        // CAS on the open states: a cancel racing `complete` cannot turn a
        // COMPLETED trip back into CANCELLED. A driver may only cancel while
        // still the assigned driver.
        const result = await prisma.ride.updateMany({
          where: {
            id: rideId,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            ...(isRider ? { riderId: userId } : { driverId: userId }),
          },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        if (result.count === 0) {
          return refuse('RIDE_CLOSED');
        }
        // Tell the other party, if there is one.
        if (isRider && ride.driverId) {
          await notifyDriver(ride.driverId, userId, ride, notice('ride-cancelled-by-rider', {}));
        } else if (isDriver) {
          await notifyRider(
            ride.riderId,
            userId,
            ride,
            notice('ride-cancelled-by-driver', {}),
          );
        }
      } else if (action === 'tip') {
        if (ride.riderId !== userId) {
          return refuse('FORBIDDEN');
        }
        if (ride.status !== 'COMPLETED') {
          return refuse('RIDE_NOT_READY');
        }
        if (!ride.driverId) {
          return refuse('RIDE_NOT_READY');
        }
        if (ride.tipCents > 0) {
          return refuse('CONFLICT');
        }
        const tipCents = body.tipCents ?? 0;
        if (tipCents <= 0) {
          return refuse('INVALID_INPUT');
        }
        // Guard against double-tipping under races: only set if still zero.
        const result = await prisma.ride.updateMany({
          where: { id: rideId, riderId: userId, status: 'COMPLETED', tipCents: 0 },
          data: { tipCents },
        });
        if (result.count === 0) {
          return refuse('CONFLICT');
        }
        await notifyDriver(
          ride.driverId,
          userId,
          ride,
          notice('ride-tipped', { tip: formatUsd(tipCents) }),
        );
      }

      const updated = await prisma.ride.findUnique({
        where: { id: rideId },
        select: { id: true, status: true, driverId: true },
      });
      return Response.json({ ride: updated });
    },
  ),
});
