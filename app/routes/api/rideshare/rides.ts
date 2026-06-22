import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidLatLng } from '@/lib/rideshare/geo';
import { routeEstimate } from '@/lib/rideshare/osm.server';
import { isRideClassId } from '@/lib/rideshare/classes';
import { notifyAvailableDrivers } from '@/lib/rideshare/notify.server';

const ACTIVE_STATUSES = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] as const;

const createSchema = z.object({
  rideClass: z.string().refine(isRideClassId, 'Invalid ride class'),
  pickupLabel: z.string().trim().min(1).max(300),
  pickupLat: z.number(),
  pickupLng: z.number(),
  dropoffLabel: z.string().trim().min(1).max(300),
  dropoffLat: z.number(),
  dropoffLng: z.number(),
  notes: z.string().trim().max(500).optional(),
});

// Shape returned to the client. Driver licence data is never selected.
const rideSelect = {
  id: true,
  rideClass: true,
  status: true,
  pickupLabel: true,
  pickupLat: true,
  pickupLng: true,
  dropoffLabel: true,
  dropoffLat: true,
  dropoffLng: true,
  distanceMeters: true,
  durationSeconds: true,
  estimatedFareCents: true,
  notes: true,
  requestedAt: true,
  acceptedAt: true,
  completedAt: true,
  cancelledAt: true,
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
        },
      },
    },
  },
} as const;

export const Route = createFileRoute('/api/rideshare/rides')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const userId = session.user.id;
          const scope = new URL(request.url).searchParams.get('scope') ?? 'mine';

          if (scope === 'available' || scope === 'driving') {
            const driver = await prisma.rideshareDriver.findUnique({
              where: { userId },
              select: { status: true },
            });
            if (!driver || driver.status !== 'APPROVED') {
              return Response.json(
                { error: 'You must be an approved driver.' },
                { status: 403 },
              );
            }
            if (scope === 'available') {
              const rides = await prisma.ride.findMany({
                where: { status: 'REQUESTED', driverId: null, riderId: { not: userId } },
                orderBy: { requestedAt: 'asc' },
                take: 50,
                select: rideSelect,
              });
              return Response.json({ rides });
            }
            const rides = await prisma.ride.findMany({
              where: { driverId: userId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
              orderBy: { acceptedAt: 'desc' },
              take: 50,
              select: rideSelect,
            });
            return Response.json({ rides });
          }

          // Default: my requested rides
          const rides = await prisma.ride.findMany({
            where: { riderId: userId },
            orderBy: { requestedAt: 'desc' },
            take: 30,
            select: rideSelect,
          });
          return Response.json({ rides });
        } catch (error) {
          console.error('Rideshare rides GET error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 15,
            windowMs: 60_000,
            prefix: 'rideshare-ride-create',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests. Please slow down.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const parsed = createSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
              { status: 400 },
            );
          }
          const body = parsed.data;
          const pickup = { lat: body.pickupLat, lng: body.pickupLng };
          const dropoff = { lat: body.dropoffLat, lng: body.dropoffLng };
          if (!isValidLatLng(pickup) || !isValidLatLng(dropoff)) {
            return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
          }

          const active = await prisma.ride.findFirst({
            where: { riderId: userId, status: { in: [...ACTIVE_STATUSES] } },
            select: { id: true },
          });
          if (active) {
            return Response.json(
              { error: 'You already have an active ride. Finish or cancel it first.' },
              { status: 409 },
            );
          }

          const estimate = await routeEstimate(pickup, dropoff);
          // Rides are free for now, so the stored fare stays at 0; the
          // indicative value is computed client-side for display only.

          const ride = await prisma.ride.create({
            data: {
              riderId: userId,
              rideClass: body.rideClass,
              pickupLabel: body.pickupLabel,
              pickupLat: body.pickupLat,
              pickupLng: body.pickupLng,
              dropoffLabel: body.dropoffLabel,
              dropoffLat: body.dropoffLat,
              dropoffLng: body.dropoffLng,
              distanceMeters: estimate.distanceMeters,
              durationSeconds: estimate.durationSeconds,
              estimatedFareCents: 0,
              notes: body.notes || null,
            },
            select: rideSelect,
          });

          // Fan the request out to online drivers (best-effort, non-blocking).
          await notifyAvailableDrivers({
            id: ride.id,
            riderId: userId,
            rideClass: body.rideClass,
            pickupLabel: body.pickupLabel,
            dropoffLabel: body.dropoffLabel,
          });

          return Response.json({ ride });
        } catch (error) {
          console.error('Rideshare rides POST error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
