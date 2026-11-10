import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { adminApplicationsQuery, adminDecisionBody } from '@/lib/rideshare/rideshare-schema';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/admin/rideshare/applications')({
  server: {
    handlers: {
      GET: implement(
        C.adminListDriverApplicationsApi,
        { auth: 'admin', query: adminApplicationsQuery },
        async ({ request }) => {
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
        },
      ),

      PATCH: implement(
        C.adminDecideDriverApplicationApi,
        {
          auth: 'admin',
          rateLimit: { policy: 'write', scope: 'user' },
          body: adminDecisionBody,
          invalid: () => Response.json({ error: 'Invalid request' }, { status: 400 }),
        },
        async ({ session, body }) => {
          const adminId = session.user.id;

          const { id, action, rejectionReason } = body;

          const driver = await prisma.rideshareDriver.findUnique({ where: { id } });
          if (!driver) {
            return Response.json({ error: 'Application not found' }, { status: 404 });
          }
          if (driver.status !== 'PENDING') {
            return Response.json({ error: 'Application already reviewed.' }, { status: 409 });
          }

          // CAS on PENDING: two admins deciding at once cannot both write (an
          // approve overwriting a reject, or vice versa).
          const claimed = await prisma.rideshareDriver.updateMany({
            where: { id, status: 'PENDING' },
            data: {
              status: action === 'approve' ? 'APPROVED' : 'REJECTED',
              rejectionReason:
                action === 'reject' ? rejectionReason || 'Application not approved.' : null,
              reviewedById: adminId,
              reviewedAt: new Date(),
            },
          });
          if (claimed.count === 0) {
            return Response.json({ error: 'Application already reviewed.' }, { status: 409 });
          }
          const updated = { status: action === 'approve' ? 'APPROVED' : 'REJECTED' };

          await prisma.adminAuditLog
            .create({
              data: {
                adminId,
                action:
                  action === 'approve' ? 'rideshare.driver.approve' : 'rideshare.driver.reject',
                targetType: 'rideshare_driver',
                targetId: id,
                detail: action === 'reject' ? rejectionReason || null : null,
              },
            })
            .catch(() => {});

          return Response.json({ status: updated.status });
        },
      ),
    },
  },
});
