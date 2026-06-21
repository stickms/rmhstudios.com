import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/**
 * GET /api/admin/reports — moderation queue. Admin only.
 * Query: ?status=PENDING|REVIEWING|RESOLVED|DISMISSED (default PENDING),
 *        ?cursor=<id>&limit=<n>. Also returns open-report counts per status.
 */
export const Route = createFileRoute('/api/admin/reports')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const url = new URL(request.url);
          const statusParam = url.searchParams.get('status') ?? 'PENDING';
          const validStatuses = ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;
          const status = (validStatuses as readonly string[]).includes(statusParam)
            ? (statusParam as (typeof validStatuses)[number])
            : 'PENDING';
          const cursor = url.searchParams.get('cursor');
          const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), 50);

          const rows = await prisma.contentReport.findMany({
            where: { status },
            orderBy: { createdAt: 'desc' },
            take: limit + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            include: { reporter: { select: userDisplaySelect } },
          });

          const hasMore = rows.length > limit;
          const pageRows = hasMore ? rows.slice(0, limit) : rows;

          // Resolve target-user display names in one batch.
          const targetIds = [...new Set(pageRows.map((r) => r.targetUserId).filter(Boolean) as string[])];
          const targets = targetIds.length
            ? await prisma.user.findMany({ where: { id: { in: targetIds } }, select: userDisplaySelect })
            : [];
          const targetMap = new Map(targets.map((t) => [t.id, resolveUser(t)]));

          const items = pageRows.map((r) => ({
            id: r.id,
            reason: r.reason,
            details: r.details,
            entityType: r.entityType,
            entityId: r.entityId,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
            reporter: resolveUser(r.reporter),
            targetUser: r.targetUserId ? targetMap.get(r.targetUserId) ?? null : null,
          }));

          const counts = await prisma.contentReport.groupBy({
            by: ['status'],
            _count: { _all: true },
          });
          const countByStatus: Record<string, number> = {};
          for (const c of counts) countByStatus[c.status] = c._count._all;

          return Response.json({
            items,
            nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
            counts: countByStatus,
          });
        } catch (error) {
          console.error('Admin reports list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
