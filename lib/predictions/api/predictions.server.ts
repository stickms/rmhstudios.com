import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import type { PredictionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createPredictionSchema, predictionListQuery } from '@/lib/predictions/predictions-schema';
import { createPredictionApi, listPredictionsApi } from '@/lib/predictions/predictions.contract';
import { listMarkets, serializeMarket } from '@/lib/predictions/predictions.server';
import { runAutoMarketTick } from '@/lib/predictions/auto-markets.server';

// Opportunistic settlement of self-referential markets — the repo's "no cron in
// the web tier" lazy pattern (cf. scheduled/publish.server.ts). Throttled to at
// most once every few minutes per web process; a dedicated Go/worker or the
// internal tick endpoint can also drive it. Fire-and-forget; never blocks reads.
let lastAutoTick = 0;
const AUTO_TICK_INTERVAL_MS = 3 * 60 * 1000;
function maybeRunAutoTick() {
  const now = Date.now();
  if (now - lastAutoTick < AUTO_TICK_INTERVAL_MS) return;
  lastAutoTick = now;
  void runAutoMarketTick().catch(() => {});
}

/**
 * GET  /api/predictions?filter=open|resolved|mine — list prediction markets.
 * POST /api/predictions — submit a new market (status PENDING, awaiting admin
 *      approval).
 */
export const route = apiRoute('/api/predictions', {
  GET: implement(
    listPredictionsApi,
    { auth: 'optional', query: predictionListQuery },
    async ({ query, session }) => {
      const viewerId = session?.user?.id;
      const filter = query.filter ?? 'open';

      maybeRunAutoTick();

      if (filter === 'mine') {
        if (!viewerId) return Response.json({ markets: [] });
        // Markets the viewer created or holds a position in.
        const rows = await prisma.prediction.findMany({
          where: {
            OR: [{ creatorId: viewerId }, { positions: { some: { userId: viewerId } } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 60,
          include: {
            creator: { select: { id: true, name: true, handle: true, image: true } },
            positions: { where: { userId: viewerId } },
          },
        });
        return Response.json({ markets: rows.map((r) => serializeMarket(r, viewerId)) });
      }

      const statuses: PredictionStatus[] =
        filter === 'resolved' ? ['RESOLVED_YES', 'RESOLVED_NO'] : ['OPEN'];
      const markets = await listMarkets({ statuses, viewerId });
      return { markets };
    },
  ),

  POST: implement(
    createPredictionApi,
    { body: createPredictionSchema, verboseValidationErrors: true },
    async ({ request, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed, retryAfter } = rateLimit(`${userId}:${ip}`, {
        limit: 6,
        windowMs: 60_000,
        prefix: 'prediction-create',
      });
      if (!allowed) {
        return Response.json(
          { error: 'Slow down a moment before submitting another prediction.' },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        );
      }

      const { title, description, closesAt } = body;

      let closes: Date | null = null;
      if (closesAt) {
        closes = new Date(closesAt);
        if (closes.getTime() <= Date.now()) {
          return Response.json({ error: 'Close time must be in the future' }, { status: 400 });
        }
      }

      // Cap how many pending submissions a single user can have open.
      const pending = await prisma.prediction.count({
        where: { creatorId: userId, status: 'PENDING' },
      });
      if (pending >= 10) {
        return Response.json(
          { error: 'You already have several predictions awaiting approval.' },
          { status: 400 },
        );
      }

      const created = await prisma.prediction.create({
        data: {
          title,
          description: description || null,
          creatorId: userId,
          closesAt: closes,
          status: 'PENDING',
        },
        include: {
          creator: { select: { id: true, name: true, handle: true, image: true } },
        },
      });

      return Response.json({ market: serializeMarket(created, userId) }, { status: 201 });
    },
  ),
});
