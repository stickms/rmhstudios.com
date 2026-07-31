/**
 * GET /api/admin/appeals — the strike-appeal review queue. Admin only.
 * Query: ?status=PENDING|UPHELD|OVERTURNED (default PENDING), ?cursor, ?limit.
 *
 * Pending appeals are returned OLDEST first — an appeal queue is a promise
 * about response time, so the oldest unanswered one is always the next job.
 * Decided tabs read newest-first like every other admin history view.
 */

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

const VALID = ['PENDING', 'UPHELD', 'OVERTURNED'] as const;
type AppealView = (typeof VALID)[number];

export const Route = createFileRoute('/api/admin/appeals')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const url = new URL(request.url);
          const raw = url.searchParams.get('status') ?? 'PENDING';
          const status: AppealView = (VALID as readonly string[]).includes(raw)
            ? (raw as AppealView)
            : 'PENDING';
          const cursor = url.searchParams.get('cursor');
          const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), 50);

          const rows = await prisma.userStrike.findMany({
            where: { appealStatus: status },
            orderBy:
              status === 'PENDING'
                ? { appealedAt: 'asc' }
                : { decidedAt: 'desc' },
            take: limit + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            select: {
              id: true,
              reason: true,
              createdAt: true,
              expiresAt: true,
              entityType: true,
              entityId: true,
              appealStatus: true,
              appealText: true,
              appealedAt: true,
              appealNote: true,
              decidedAt: true,
              user: { select: userDisplaySelect },
              admin: { select: userDisplaySelect },
              appealAdmin: { select: userDisplaySelect },
            },
          });

          const hasMore = rows.length > limit;
          const page = hasMore ? rows.slice(0, limit) : rows;

          const counts = Object.fromEntries(
            (
              await prisma.userStrike.groupBy({
                by: ['appealStatus'],
                _count: { _all: true },
                where: { appealStatus: { in: [...VALID] } },
              })
            ).map((g) => [g.appealStatus, g._count._all])
          );

          return Response.json({
            items: page.map((s) => ({
              id: s.id,
              reason: s.reason,
              createdAt: s.createdAt.toISOString(),
              expiresAt: s.expiresAt?.toISOString() ?? null,
              entityType: s.entityType,
              entityId: s.entityId,
              appealStatus: s.appealStatus,
              appealText: s.appealText,
              appealedAt: s.appealedAt?.toISOString() ?? null,
              appealNote: s.appealNote,
              decidedAt: s.decidedAt?.toISOString() ?? null,
              user: resolveUser(s.user),
              issuedBy: resolveUser(s.admin),
              decidedBy: s.appealAdmin ? resolveUser(s.appealAdmin) : null,
            })),
            counts,
            nextCursor: hasMore ? page[page.length - 1]?.id : null,
          });
        } catch (error) {
          console.error('admin appeals list error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
