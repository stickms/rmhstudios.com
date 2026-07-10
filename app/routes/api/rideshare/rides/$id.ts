import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { notifyRider, notifyDriver } from '@/lib/rideshare/notify.server';
import { MAX_TIP_CENTS, formatUsd } from '@/lib/rideshare/geo';

const actionSchema = z.object({
  action: z.enum(['accept', 'start', 'complete', 'cancel', 'tip']),
  // Only used by the `tip` action: a rider tip (in cents) for a completed trip.
  tipCents: z.coerce.number().int().min(1).max(MAX_TIP_CENTS).optional(),
});

export const Route = createFileRoute('/api/rideshare/rides/$id')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const userId = session.user.id;
          const rideId = params.id;

          const parsed = actionSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: 'Invalid action' }, { status: 400 });
          }
          const { action } = parsed.data;

          const ride = await prisma.ride.findUnique({
            where: { id: rideId },
            select: { id: true, riderId: true, driverId: true, status: true, rideClass: true, tipCents: true },
          });
          if (!ride) {
            return Response.json({ error: 'Ride not found' }, { status: 404 });
          }

          if (action === 'accept') {
            if (ride.riderId === userId) {
              return Response.json({ error: 'You cannot accept your own ride.' }, { status: 400 });
            }
            const driver = await prisma.rideshareDriver.findUnique({
              where: { userId },
              select: { status: true },
            });
            if (!driver || driver.status !== 'APPROVED') {
              return Response.json({ error: 'You must be an approved driver.' }, { status: 403 });
            }
            // Guard against races: only claim if still open. Scheduled rides
            // are claimable once they enter the 60-minute lead window.
            const leadDate = new Date(Date.now() + 60 * 60 * 1000);
            const result = await prisma.ride.updateMany({
              where: {
                id: rideId,
                driverId: null,
                OR: [
                  { status: 'REQUESTED' },
                  { status: 'SCHEDULED', scheduledFor: { lte: leadDate } },
                ],
              },
              data: { driverId: userId, status: 'ACCEPTED', acceptedAt: new Date() },
            });
            if (result.count === 0) {
              return Response.json(
                { error: 'This ride isn’t available to accept yet.' },
                { status: 409 },
              );
            }
            const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
            await notifyRider(ride.riderId, userId, ride, `${me?.name ?? 'Your driver'} accepted your ride and is on the way.`);
          } else if (action === 'start') {
            if (ride.driverId !== userId) {
              return Response.json({ error: 'Only the assigned driver can do that.' }, { status: 403 });
            }
            const result = await prisma.ride.updateMany({
              where: { id: rideId, driverId: userId, status: 'ACCEPTED' },
              data: { status: 'IN_PROGRESS' },
            });
            if (result.count === 0) {
              return Response.json({ error: 'Ride is not ready to start.' }, { status: 409 });
            }
            await notifyRider(ride.riderId, userId, ride, 'Your trip has started. Enjoy the ride!');
          } else if (action === 'complete') {
            if (ride.driverId !== userId) {
              return Response.json({ error: 'Only the assigned driver can do that.' }, { status: 403 });
            }
            const result = await prisma.ride.updateMany({
              where: { id: rideId, driverId: userId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
              data: { status: 'COMPLETED', completedAt: new Date() },
            });
            if (result.count === 0) {
              return Response.json({ error: 'Ride cannot be completed.' }, { status: 409 });
            }
            await notifyRider(ride.riderId, userId, ride, 'Your trip is complete. Tap to rate your driver.');
          } else if (action === 'cancel') {
            const isRider = ride.riderId === userId;
            const isDriver = ride.driverId === userId;
            if (!isRider && !isDriver) {
              return Response.json({ error: 'Not your ride.' }, { status: 403 });
            }
            if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
              return Response.json({ error: 'Ride is already closed.' }, { status: 409 });
            }
            await prisma.ride.update({
              where: { id: rideId },
              data: { status: 'CANCELLED', cancelledAt: new Date() },
            });
            // Tell the other party, if there is one.
            if (isRider && ride.driverId) {
              await notifyDriver(ride.driverId, userId, ride, 'The rider cancelled this trip.');
            } else if (isDriver) {
              await notifyRider(ride.riderId, userId, ride, 'Your driver cancelled — request a new ride anytime.');
            }
          } else if (action === 'tip') {
            if (ride.riderId !== userId) {
              return Response.json({ error: 'Only the rider can add a tip.' }, { status: 403 });
            }
            if (ride.status !== 'COMPLETED') {
              return Response.json({ error: 'You can only tip a completed trip.' }, { status: 409 });
            }
            if (!ride.driverId) {
              return Response.json({ error: 'This trip has no driver to tip.' }, { status: 409 });
            }
            if (ride.tipCents > 0) {
              return Response.json({ error: 'You already tipped this trip.' }, { status: 409 });
            }
            const tipCents = parsed.data.tipCents ?? 0;
            if (tipCents <= 0) {
              return Response.json({ error: 'Enter a tip amount.' }, { status: 400 });
            }
            // Guard against double-tipping under races: only set if still zero.
            const result = await prisma.ride.updateMany({
              where: { id: rideId, riderId: userId, status: 'COMPLETED', tipCents: 0 },
              data: { tipCents },
            });
            if (result.count === 0) {
              return Response.json({ error: 'You already tipped this trip.' }, { status: 409 });
            }
            await notifyDriver(
              ride.driverId,
              userId,
              ride,
              `Your rider added a ${formatUsd(tipCents)} tip. Thanks for the great ride!`,
            );
          }

          const updated = await prisma.ride.findUnique({
            where: { id: rideId },
            select: { id: true, status: true, driverId: true },
          });
          return Response.json({ ride: updated });
        } catch (error) {
          console.error('Rideshare ride action error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
