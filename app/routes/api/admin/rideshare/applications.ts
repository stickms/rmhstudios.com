import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';

function isAdmin(session: { user: unknown } | null): boolean {
  return !!session && !!(session.user as { isAdmin?: boolean }).isAdmin;
}

const decisionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().trim().max(500).optional(),
});

export const Route = createFileRoute('/api/admin/rideshare/applications')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, session }) => {
        if (!isAdmin(session)) {
          return new Response('Unauthorized', { status: 401 });
        }
        const statusParam = new URL(request.url).searchParams.get('status') ?? 'PENDING';
        const status = ['PENDING', 'APPROVED', 'REJECTED'].includes(statusParam)
          ? (statusParam as 'PENDING' | 'APPROVED' | 'REJECTED')
          : 'PENDING';

        const drivers = await prisma.rideshareDriver.findMany({
          where: { status },
          orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
          take: 100,
          include: {
            user: { select: { id: true, name: true, handle: true, image: true, email: true } },
          },
        });

        const items = drivers.map((d) => ({
          id: d.id,
          status: d.status,
          user: d.user,
          vehicleMake: d.vehicleMake,
          vehicleModel: d.vehicleModel,
          vehicleYear: d.vehicleYear,
          vehicleColor: d.vehicleColor,
          licensePlate: d.licensePlate,
          vehicleClass: d.vehicleClass,
          seats: d.seats,
          licenseNumber: d.licenseNumber,
          rejectionReason: d.rejectionReason,
          createdAt: d.createdAt,
          reviewedAt: d.reviewedAt,
        }));

        return Response.json({ items });
      }),

      PATCH: defineHandler({ auth: 'optional' }, async ({ request, session }) => {
        if (!isAdmin(session)) {
          return new Response('Unauthorized', { status: 401 });
        }
        const adminId = session!.user.id;

        const parsed = decisionSchema.safeParse(await request.json());
        if (!parsed.success) {
          return Response.json({ error: 'Invalid request' }, { status: 400 });
        }
        const { id, action, rejectionReason } = parsed.data;

        const driver = await prisma.rideshareDriver.findUnique({ where: { id } });
        if (!driver) {
          return Response.json({ error: 'Application not found' }, { status: 404 });
        }
        if (driver.status !== 'PENDING') {
          return Response.json({ error: 'Application already reviewed.' }, { status: 409 });
        }

        const updated = await prisma.rideshareDriver.update({
          where: { id },
          data: {
            status: action === 'approve' ? 'APPROVED' : 'REJECTED',
            rejectionReason:
              action === 'reject' ? rejectionReason || 'Application not approved.' : null,
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        });

        await prisma.adminAuditLog
          .create({
            data: {
              adminId,
              action: action === 'approve' ? 'rideshare.driver.approve' : 'rideshare.driver.reject',
              targetType: 'rideshare_driver',
              targetId: id,
              detail: action === 'reject' ? rejectionReason || null : null,
            },
          })
          .catch(() => {});

        return Response.json({ status: updated.status });
      }),
    },
  },
});
