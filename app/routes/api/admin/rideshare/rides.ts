/**
 * Admin — RMH Rideshare ride history (/api/admin/rideshare/rides)
 *
 * Returns every ride for the admin dashboard, regardless of whether a driver
 * ever accepted it (so unmatched / expired requests are visible too). Supports
 * an optional `status` filter and a free-text `q` search over the rider, driver
 * and the pickup/drop-off labels.
 */
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import type { Prisma } from '@prisma/client';

function isAdmin(session: { user: unknown } | null): boolean {
  return !!session && !!(session.user as { isAdmin?: boolean }).isAdmin;
}

const STATUSES = [
  'SCHEDULED',
  'REQUESTED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

const rideSelect = {
  id: true,
  rideClass: true,
  status: true,
  pickupLabel: true,
  dropoffLabel: true,
  distanceMeters: true,
  durationSeconds: true,
  estimatedFareCents: true,
  scheduledFor: true,
  requestedAt: true,
  acceptedAt: true,
  completedAt: true,
  cancelledAt: true,
  rider: { select: { id: true, name: true, handle: true, image: true, email: true } },
  driver: { select: { id: true, name: true, handle: true, image: true } },
} as const;

export const Route = createFileRoute('/api/admin/rideshare/rides')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!isAdmin(session)) {
            return new Response('Unauthorized', { status: 401 });
          }

          const params = new URL(request.url).searchParams;
          const statusParam = params.get('status');
          const q = params.get('q')?.trim();

          const where: Prisma.RideWhereInput = {};
          if (statusParam && (STATUSES as readonly string[]).includes(statusParam)) {
            where.status = statusParam as (typeof STATUSES)[number];
          }
          if (q) {
            where.OR = [
              { pickupLabel: { contains: q, mode: 'insensitive' } },
              { dropoffLabel: { contains: q, mode: 'insensitive' } },
              { rider: { name: { contains: q, mode: 'insensitive' } } },
              { rider: { handle: { contains: q, mode: 'insensitive' } } },
              { driver: { name: { contains: q, mode: 'insensitive' } } },
            ];
          }

          const rides = await prisma.ride.findMany({
            where,
            orderBy: { requestedAt: 'desc' },
            take: 100,
            select: rideSelect,
          });

          return Response.json({ rides });
        } catch (error) {
          console.error('Admin rideshare rides GET error:', error);
          return new Response('Internal Error', { status: 500 });
        }
      },
    },
  },
});
