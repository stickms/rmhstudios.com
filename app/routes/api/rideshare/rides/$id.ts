import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

const actionSchema = z.object({
  action: z.enum(['accept', 'start', 'complete', 'cancel']),
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
            select: { id: true, riderId: true, driverId: true, status: true },
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
            // Guard against races: only claim if still open.
            const result = await prisma.ride.updateMany({
              where: { id: rideId, status: 'REQUESTED', driverId: null },
              data: { driverId: userId, status: 'ACCEPTED', acceptedAt: new Date() },
            });
            if (result.count === 0) {
              return Response.json(
                { error: 'This ride has already been claimed.' },
                { status: 409 },
              );
            }
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
