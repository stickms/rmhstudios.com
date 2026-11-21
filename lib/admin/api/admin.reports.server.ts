import { pageSize } from '@/lib/pagination';
import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { noteCountsFor } from '@/lib/moderation/notes.server';

/**
 * GET /api/admin/reports — moderation queue. Admin only.
 * Query: ?status=PENDING|REVIEWING|RESOLVED|DISMISSED (default PENDING),
 *        ?cursor=<id>&limit=<n>. Also returns open-report counts per status.
 */
export const route = apiRoute('/api/admin/reports', {
  GET: implement(
    C.getAdminReportsApi,
    {
      auth: 'admin',
      query: z.object({
        status: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.string().optional(),
      }),
    },
    async ({ request }) => {
      const url = new URL(request.url);
      const statusParam = url.searchParams.get('status') ?? 'PENDING';
      const validStatuses = ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;
      const status = (validStatuses as readonly string[]).includes(statusParam)
        ? (statusParam as (typeof validStatuses)[number])
        : 'PENDING';
      const cursor = url.searchParams.get('cursor');
      const limit = pageSize(url.searchParams.get('limit'), 25, 50);

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
      const targetIds = [
        ...new Set(pageRows.map((r) => r.targetUserId).filter(Boolean) as string[]),
      ];
      const targets = targetIds.length
        ? await prisma.user.findMany({
            where: { id: { in: targetIds } },
            select: userDisplaySelect,
          })
        : [];
      const targetMap = new Map(targets.map((t) => [t.id, resolveUser(t)]));
      // s03-04: one groupBy for the visible members' moderator-note counts.
      const noteCounts = await noteCountsFor(targetIds);

      const items = pageRows.map((r) => ({
        id: r.id,
        reason: r.reason,
        details: r.details,
        entityType: r.entityType,
        entityId: r.entityId,
        status: r.status,
        // s03-16: a withdrawn report is DISMISSED, so it never sits in the pending queue; moderators still see why.
        withdrawn: r.withdrawnAt !== null,
        createdAt: r.createdAt.toISOString(),
        reporter: resolveUser(r.reporter),
        targetUser: r.targetUserId ? (targetMap.get(r.targetUserId) ?? null) : null,
        targetNoteCount: r.targetUserId ? (noteCounts.get(r.targetUserId) ?? 0) : 0,
      }));

      const counts = await prisma.contentReport.groupBy({
        by: ['status'],
        _count: { _all: true },
      });
      const countByStatus: Record<string, number> = {};
      for (const c of counts) countByStatus[c.status] = c._count._all;

      return Response.json({
        items,
        nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
        counts: countByStatus,
      });
    },
  ),
});
