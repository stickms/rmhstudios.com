import { createFileRoute } from '@tanstack/react-router';
import type { PredictionStatus } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createPredictionSchema } from '@/lib/predictions/predictions-schema';
import { listMarkets, serializeMarket } from '@/lib/predictions/predictions.server';

/**
 * GET  /api/predictions?filter=open|resolved|mine — list prediction markets.
 * POST /api/predictions — submit a new market (status PENDING, awaiting admin
 *      approval).
 */
export const Route = createFileRoute('/api/predictions/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          const viewerId = session?.user?.id;
          const url = new URL(request.url);
          const filter = url.searchParams.get('filter') ?? 'open';

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
          return Response.json({ markets });
        } catch (error) {
          console.error('Predictions list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
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

          const parsed = createPredictionSchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }
          const { title, description, closesAt } = parsed.data;

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
        } catch (error) {
          console.error('Prediction create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
