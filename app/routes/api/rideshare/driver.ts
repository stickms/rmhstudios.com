import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { driverApplicationBody, driverOnlineBody } from '@/lib/rideshare/rideshare-schema';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { diagnoseServerError } from '@/lib/rideshare/errors.server';

/** Public-safe view of a driver record (never exposes the licence key). */
function publicDriver(d: {
  status: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  licensePlate: string;
  vehicleClass: string;
  seats: number;
  isOnline: boolean;
  ratingCount: number;
  ratingTotal: number;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}) {
  return {
    status: d.status,
    vehicleMake: d.vehicleMake,
    vehicleModel: d.vehicleModel,
    vehicleYear: d.vehicleYear,
    vehicleColor: d.vehicleColor,
    licensePlate: d.licensePlate,
    vehicleClass: d.vehicleClass,
    seats: d.seats,
    isOnline: d.isOnline,
    ratingCount: d.ratingCount,
    ratingAvg: d.ratingCount > 0 ? d.ratingTotal / d.ratingCount : null,
    rejectionReason: d.rejectionReason,
    createdAt: d.createdAt,
    reviewedAt: d.reviewedAt,
  };
}

export const Route = createFileRoute('/api/rideshare/driver')({
  server: {
    handlers: {
      GET: implement(C.getDriverApi, {}, async ({ session }) => {
        try {
          const driver = await prisma.rideshareDriver.findUnique({
            where: { userId: session.user.id },
          });
          return Response.json({ driver: driver ? publicDriver(driver) : null });
        } catch (error) {
          console.error('Rideshare driver GET error:', error);
          const { status, error: message } = diagnoseServerError(error);
          return Response.json({ error: message }, { status });
        }
      }),

      // Toggle availability (online/offline) for approved drivers.
      PATCH: implement(
        C.setDriverOnlineApi,
        {
          body: driverOnlineBody,
          // A missing/unparseable body used to read as `{}`; keep that.
          allowEmptyBody: true,
          invalid: () => Response.json({ error: 'isOnline boolean required' }, { status: 400 }),
        },
        async ({ session, body }) => {
          const result = await prisma.rideshareDriver.updateMany({
            where: { userId: session.user.id, status: 'APPROVED' },
            data: { isOnline: body.isOnline },
          });
          if (result.count === 0) {
            return Response.json({ error: 'Not an approved driver.' }, { status: 403 });
          }
          return Response.json({ isOnline: body.isOnline });
        },
      ),

      // Not `implement`/`body`: the 409 "already applied" check must run BEFORE
      // body validation (400), an order the wrapper's body option cannot express.
      POST: defineHandler({}, async ({ request, session }) => {
        try {
          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 5,
            windowMs: 60_000,
            prefix: 'rideshare-driver-apply',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many attempts. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const existing = await prisma.rideshareDriver.findUnique({
            where: { userId: session.user.id },
          });
          if (existing && existing.status !== 'REJECTED') {
            return Response.json(
              {
                error:
                  existing.status === 'APPROVED'
                    ? 'You are already an approved driver.'
                    : 'Your application is already under review.',
              },
              { status: 409 },
            );
          }

          const body = await request.json().catch(() => ({}));
          const parsed = driverApplicationBody.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid details' },
              { status: 400 },
            );
          }

          const data = {
            ...parsed.data,
            status: 'PENDING' as const,
            reviewedById: null,
            reviewedAt: null,
            rejectionReason: null,
          };

          const driver = await prisma.rideshareDriver.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, ...data },
            update: data,
          });

          return Response.json({ driver: publicDriver(driver) });
        } catch (error) {
          console.error('Rideshare driver apply error:', error);
          const { status, error: message } = diagnoseServerError(error);
          return Response.json({ error: message }, { status });
        }
      }),
    },
  },
});
