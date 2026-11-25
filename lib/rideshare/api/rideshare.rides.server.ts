import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { createRideBody, listRidesQuery } from '@/lib/rideshare/rideshare-schema';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidLatLng, estimateFareCents } from '@/lib/rideshare/geo';
import { routeEstimate } from '@/lib/rideshare/osm.server';
import { notifyAvailableDrivers } from '@/lib/rideshare/notify.server';
import { blockedRiderFilter, refuse } from '@/lib/rideshare/safety.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';

const ACTIVE_STATUSES = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] as const;

// How far ahead a scheduled ride becomes visible/claimable by drivers.
const SCHEDULE_LEAD_MS = 60 * 60 * 1000; // 60 min
const MIN_SCHEDULE_AHEAD_MS = 5 * 60 * 1000; // 5 min
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_UPCOMING_SCHEDULED = 5;

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
  tipCents: true,
  scheduledFor: true,
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

export const route = apiRoute('/api/rideshare/rides', {
  GET: implement(C.listRidesApi, { query: listRidesQuery }, async ({ request, session }) => {
    const userId = session.user.id;
    const scope = new URL(request.url).searchParams.get('scope') ?? 'mine';

    if (scope === 'available' || scope === 'driving') {
      const driver = await prisma.rideshareDriver.findUnique({
        where: { userId },
        select: { status: true },
      });
      if (!driver || driver.status !== 'APPROVED') {
        return refuse('RIDE_DRIVER_NOT_APPROVED');
      }
      if (scope === 'available') {
        // Open immediate requests, plus scheduled rides that are now
        // within the lead window so drivers can claim them ahead of time.
        // A rider who has blocked this driver, or whom this driver blocked, is left out in the query itself, so a
        // page of 50 stays full. A failed block lookup fails the request.
        const blocked = await getBlockedAuthorIds(userId);
        const rides = await prisma.ride.findMany({
          where: {
            driverId: null,
            ...blockedRiderFilter(blocked, userId),
            OR: [
              { status: 'REQUESTED' },
              {
                status: 'SCHEDULED',
                scheduledFor: { lte: new Date(Date.now() + SCHEDULE_LEAD_MS) },
              },
            ],
          },
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

    // Default: my rides (newest first; includes upcoming scheduled rides)
    const rides = await prisma.ride.findMany({
      where: { riderId: userId },
      orderBy: { requestedAt: 'desc' },
      take: 40,
      select: rideSelect,
    });
    return Response.json({ rides });
  }),

  POST: implement(
    C.createRideApi,
    {
      body: createRideBody,
      // Keep the route's own message: the first zod issue, as before.
      invalid: () => refuse('INVALID_INPUT'),
    },
    async ({ request, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed, retryAfter } = rateLimit(ip, {
        limit: 15,
        windowMs: 60_000,
        prefix: 'rideshare-ride-create',
      });
      if (!allowed) {
        return refuse('RATE_LIMITED', undefined, { 'Retry-After': String(retryAfter) });
      }

      const pickup = { lat: body.pickupLat, lng: body.pickupLng };
      const dropoff = { lat: body.dropoffLat, lng: body.dropoffLng };
      if (!isValidLatLng(pickup) || !isValidLatLng(dropoff)) {
        return refuse('INVALID_INPUT');
      }

      // Validate the scheduled time, if booking for later.
      let scheduledFor: Date | null = null;
      if (body.scheduledFor) {
        const when = new Date(body.scheduledFor);
        const delta = when.getTime() - Date.now();
        if (Number.isNaN(when.getTime()) || delta < MIN_SCHEDULE_AHEAD_MS) {
          return refuse('RIDE_SCHEDULE_TOO_SOON');
        }
        if (delta > MAX_SCHEDULE_AHEAD_MS) {
          return refuse('RIDE_SCHEDULE_TOO_FAR');
        }
        scheduledFor = when;
      }

      if (scheduledFor) {
        const upcoming = await prisma.ride.count({
          where: { riderId: userId, status: 'SCHEDULED' },
        });
        if (upcoming >= MAX_UPCOMING_SCHEDULED) {
          return refuse('RIDE_SCHEDULE_LIMIT', { max: MAX_UPCOMING_SCHEDULED });
        }
      } else {
        // Immediate rides are limited to one active at a time.
        const active = await prisma.ride.findFirst({
          where: { riderId: userId, status: { in: [...ACTIVE_STATUSES] } },
          select: { id: true },
        });
        if (active) {
          return refuse('RIDE_ACTIVE');
        }
      }

      const estimate = await routeEstimate(pickup, dropoff, false);
      // The estimated fare is stored for history, the driver "value
      // delivered" stat, and future payouts. Riders aren't charged.
      const quoteCents = estimateFareCents(
        estimate.distanceMeters,
        body.rideClass,
        estimate.durationSeconds,
      );

      const ride = await prisma.ride.create({
        data: {
          riderId: userId,
          rideClass: body.rideClass,
          status: scheduledFor ? 'SCHEDULED' : 'REQUESTED',
          scheduledFor,
          pickupLabel: body.pickupLabel,
          pickupLat: body.pickupLat,
          pickupLng: body.pickupLng,
          dropoffLabel: body.dropoffLabel,
          dropoffLat: body.dropoffLat,
          dropoffLng: body.dropoffLng,
          distanceMeters: estimate.distanceMeters,
          durationSeconds: estimate.durationSeconds,
          estimatedFareCents: quoteCents,
          notes: body.notes || null,
        },
        select: rideSelect,
      });

      // Notify online drivers for immediate rides (and near-term scheduled
      // ones that are already inside the lead window).
      const notifyNow = !scheduledFor || scheduledFor.getTime() - Date.now() <= SCHEDULE_LEAD_MS;
      if (notifyNow) {
        await notifyAvailableDrivers({
          id: ride.id,
          riderId: userId,
          rideClass: body.rideClass,
          pickupLabel: body.pickupLabel,
          dropoffLabel: body.dropoffLabel,
        });
      }

      return Response.json({ ride });
    },
  ),
});
