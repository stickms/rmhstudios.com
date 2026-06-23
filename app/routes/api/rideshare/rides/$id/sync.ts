import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/**
 * Lightweight snapshot of a single ride for the live trip panel: status, the
 * other party, the driver's recent location, and chat messages. Polled every
 * few seconds by both rider and driver. Only the rider/driver may read it.
 */
export const Route = createFileRoute('/api/rideshare/rides/$id/sync')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const userId = session.user.id;

          const ride = await prisma.ride.findUnique({
            where: { id: params.id },
            select: {
              id: true,
              status: true,
              rideClass: true,
              pickupLabel: true,
              pickupLat: true,
              pickupLng: true,
              dropoffLabel: true,
              dropoffLat: true,
              dropoffLng: true,
              distanceMeters: true,
              durationSeconds: true,
              estimatedFareCents: true,
              tipCents: true,
              requestedAt: true,
              acceptedAt: true,
              completedAt: true,
              ratingByRider: true,
              ratingByDriver: true,
              riderId: true,
              driverId: true,
              rider: { select: { id: true, name: true, handle: true, image: true } },
              driver: {
                select: {
                  id: true,
                  name: true,
                  handle: true,
                  image: true,
                  rideshareDriver: {
                    select: {
                      vehicleMake: true,
                      vehicleModel: true,
                      vehicleColor: true,
                      vehicleYear: true,
                      licensePlate: true,
                      seats: true,
                      lastLat: true,
                      lastLng: true,
                      locationUpdatedAt: true,
                      ratingCount: true,
                      ratingTotal: true,
                    },
                  },
                },
              },
              messages: {
                orderBy: { createdAt: 'asc' },
                take: 100,
                select: { id: true, senderId: true, content: true, createdAt: true },
              },
            },
          });

          if (!ride) {
            return Response.json({ error: 'Ride not found' }, { status: 404 });
          }
          const isRider = ride.riderId === userId;
          const isDriver = ride.driverId === userId;
          if (!isRider && !isDriver) {
            return Response.json({ error: 'Not your ride.' }, { status: 403 });
          }

          const { riderId, driverId, ...rest } = ride;
          void riderId;
          void driverId;
          return Response.json({
            ride: rest,
            role: isRider ? 'rider' : 'driver',
          });
        } catch (error) {
          console.error('Rideshare sync error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
