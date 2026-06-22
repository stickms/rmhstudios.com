import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { validateImageBuffer, detectImageExt } from '@/lib/slice-it/upload-validation';
import { putObject, deleteObject } from '@/lib/storage/s3.server';
import { contentTypeForFilename } from '@/lib/storage/keys';
import { licenseKey } from '@/lib/rideshare/license-storage';
import { isRideClassId } from '@/lib/rideshare/classes';

const LICENSE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const currentYear = new Date().getFullYear();

const applicationSchema = z.object({
  vehicleMake: z.string().trim().min(1).max(60),
  vehicleModel: z.string().trim().min(1).max(60),
  vehicleYear: z.coerce.number().int().min(1980).max(currentYear + 2),
  vehicleColor: z.string().trim().min(1).max(30),
  licensePlate: z.string().trim().min(1).max(16),
  vehicleClass: z.string().refine(isRideClassId, 'Invalid ride class'),
  seats: z.coerce.number().int().min(1).max(8),
});

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
    rejectionReason: d.rejectionReason,
    createdAt: d.createdAt,
    reviewedAt: d.reviewedAt,
  };
}

export const Route = createFileRoute('/api/rideshare/driver')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const driver = await prisma.rideshareDriver.findUnique({
          where: { userId: session.user.id },
        });
        return Response.json({ driver: driver ? publicDriver(driver) : null });
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

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

          const formData = await request.formData();
          const parsed = applicationSchema.safeParse({
            vehicleMake: formData.get('vehicleMake'),
            vehicleModel: formData.get('vehicleModel'),
            vehicleYear: formData.get('vehicleYear'),
            vehicleColor: formData.get('vehicleColor'),
            licensePlate: formData.get('licensePlate'),
            vehicleClass: formData.get('vehicleClass'),
            seats: formData.get('seats'),
          });
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid details' },
              { status: 400 },
            );
          }

          const file = formData.get('license');
          if (!(file instanceof File) || file.size === 0) {
            return Response.json(
              { error: 'A photo of your driver’s license is required.' },
              { status: 400 },
            );
          }
          if (file.size > LICENSE_MAX_BYTES) {
            return Response.json(
              { error: `License image too large (max ${LICENSE_MAX_BYTES / 1024 / 1024} MB).` },
              { status: 400 },
            );
          }
          const buffer = Buffer.from(await file.arrayBuffer());
          const validation = validateImageBuffer(buffer);
          if (!validation.ok) {
            return Response.json({ error: validation.error }, { status: 400 });
          }
          const ext = detectImageExt(buffer);
          if (!ext) {
            return Response.json({ error: 'Unsupported image format.' }, { status: 400 });
          }

          const filename = `${session.user.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
          const key = licenseKey(filename);
          await putObject(key, buffer, contentTypeForFilename(filename));

          // If re-applying, clean up any previously stored licence.
          if (existing?.licenseImageKey && existing.licenseImageKey !== key) {
            await deleteObject(existing.licenseImageKey).catch(() => {});
          }

          const data = {
            ...parsed.data,
            status: 'PENDING' as const,
            licenseImageKey: key,
            licenseDeletedAt: null,
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
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
