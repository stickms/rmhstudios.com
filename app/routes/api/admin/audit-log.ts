import { pageSize } from '@/lib/pagination';
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import {
  AUDIT_CSV_MAX_ROWS,
  auditRowsToCsv,
  buildAuditWhere,
  parseAuditFilters,
} from '@/lib/admin/audit-query';

/**
 * GET /api/admin/audit-log — recent admin actions (cursor paginated).
 *
 * Filters (all optional): `action` (prefix, e.g. `user.`), `targetType`, and an
 * inclusive `from`/`to` day range (`YYYY-MM-DD`, UTC). `format=csv` returns the
 * newest matching rows (capped at AUDIT_CSV_MAX_ROWS) as a CSV download.
 */
export const Route = createFileRoute('/api/admin/audit-log')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin' }, async ({ request }) => {
        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor');
        const limit = pageSize(url.searchParams.get('limit'), 50, 100);
        const where = buildAuditWhere(parseAuditFilters(url.searchParams));

        if (url.searchParams.get('format') === 'csv') {
          const all = await prisma.adminAuditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: AUDIT_CSV_MAX_ROWS,
            include: { admin: { select: userDisplaySelect } },
          });
          const csv = auditRowsToCsv(
            all.map((r) => {
              const a = resolveUser(r.admin);
              return {
                createdAt: r.createdAt.toISOString(),
                admin: a.name || a.handle || r.adminId,
                action: r.action,
                targetType: r.targetType,
                targetId: r.targetId,
                detail: r.detail,
              };
            }),
          );
          return new Response(csv, {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': 'attachment; filename="audit-log.csv"',
              'Cache-Control': 'no-store',
            },
          });
        }

        const rows = await prisma.adminAuditLog.findMany({
          where,
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
          nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        });
      }),
    },
  },
});
