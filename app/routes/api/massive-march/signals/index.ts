import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { puzzleSite } from '@/lib/massive-march/world/sites';
import {
  listSignalsQuerySchema,
  MAX_SIGNALS_PER_AUTHOR_PER_SITE,
  postSignalSchema,
  SIGNALS_SHOWN,
  type SignalTemplate,
  type SignalView,
} from '@/lib/massive-march/signals';

/**
 * GET  /api/massive-march/signals?siteId= — best-rated hints left at a site (R18).
 * POST /api/massive-march/signals         — leave one (fixed phrase, no free text).
 */
export const Route = createFileRoute('/api/massive-march/signals/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: listSignalsQuerySchema },
        async ({ userId, query }) => {
          const rows = await prisma.marchSignal.findMany({
            where: { siteId: query.siteId },
            orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
            take: SIGNALS_SHOWN,
            include: { votes: userId ? { where: { userId }, select: { value: true } } : false },
          });
          const signals: SignalView[] = rows.map((r) => ({
            id: r.id,
            template: r.template as SignalTemplate,
            param: r.param,
            score: r.score,
            myVote: (r.votes?.[0]?.value ?? 0) as -1 | 0 | 1,
            mine: r.authorId === userId,
          }));
          return Response.json({ signals }, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: postSignalSchema },
        async ({ userId, body }) => {
          if (!puzzleSite(body.siteId))
            return Response.json({ error: 'unknown-site' }, { status: 404 });
          const mine = await prisma.marchSignal.count({
            where: { siteId: body.siteId, authorId: userId },
          });
          if (mine >= MAX_SIGNALS_PER_AUTHOR_PER_SITE) {
            return Response.json({ error: 'limit' }, { status: 409 });
          }
          try {
            const row = await prisma.marchSignal.create({
              data: {
                siteId: body.siteId,
                authorId: userId,
                template: body.template,
                param: body.param,
              },
              select: { id: true },
            });
            return Response.json({ id: row.id }, { status: 201 });
          } catch {
            return Response.json({ error: 'duplicate' }, { status: 409 });
          }
        },
      ),
    },
  },
});
