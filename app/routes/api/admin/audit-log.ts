import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/** GET /api/admin/audit-log — recent admin actions (cursor paginated). */
export const Route = createFileRoute('/api/admin/audit-log')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }
          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);

          const rows = await prisma.adminAuditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            include: { admin: { select: userDisplaySelect } },
          });
          const hasMore = rows.length > limit;
          const page = hasMore ? rows.slice(0, limit) : rows;

          return Response.json({
            items: page.map((r) => ({
              id: r.id,
              action: r.action,
              targetType: r.targetType,
              targetId: r.targetId,
              detail: r.detail,
              createdAt: r.createdAt.toISOString(),
              admin: resolveUser(r.admin),
            })),
            nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
          });
        } catch (error) {
          console.error('Audit log error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
