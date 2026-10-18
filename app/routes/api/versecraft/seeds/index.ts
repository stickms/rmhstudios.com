import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { screenNewContent } from '@/lib/moderation/auto-moderate.server';
import { normalizeSeed } from '@/lib/versecraft/gen/rng';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  listSeedsQuerySchema,
  MAX_LISTINGS_PER_AUTHOR,
  publishSeedSchema,
  type SeedListingView,
} from '@/lib/versecraft/seed-gallery';

/**
 * GET  /api/versecraft/seeds — published story seeds, top-rated or newest (R13).
 * POST /api/versecraft/seeds — publish a seed you have played, with a title.
 */
export const Route = createFileRoute('/api/versecraft/seeds/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: listSeedsQuerySchema },
        async ({ userId, query }) => {
          const rows = await prisma.versecraftSeedListing.findMany({
            // Rating order needs an average; a sum-over-count sort is not indexable, so
            // order by ratingSum (a fair proxy at this scale) and newest as tiebreak.
            orderBy:
              query.sort === 'new'
                ? { createdAt: 'desc' }
                : [{ ratingSum: 'desc' }, { createdAt: 'desc' }],
            take: 40,
            include: {
              author: { select: userDisplaySelect },
              ratings: userId ? { where: { userId }, select: { stars: true } } : false,
            },
          });
          const listings: SeedListingView[] = rows.map((r) => ({
            id: r.id,
            seed: r.seed,
            title: r.title,
            author: resolveUser(r.author).name,
            average: r.ratingCount ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : 0,
            ratingCount: r.ratingCount,
            forks: r.forks,
            myStars: r.ratings?.[0]?.stars ?? 0,
            mine: r.authorId === userId,
          }));
          return Response.json({ listings }, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: publishSeedSchema },
        async ({ userId, body }) => {
          const seed = normalizeSeed(body.seed);
          // Only a world that really exists can be continued by someone else.
          const world = await prisma.versecraftWorld.findUnique({
            where: { seed },
            select: { seed: true },
          });
          if (!world) return Response.json({ error: 'unknown-seed' }, { status: 404 });
          const count = await prisma.versecraftSeedListing.count({ where: { authorId: userId } });
          if (count >= MAX_LISTINGS_PER_AUTHOR) {
            return Response.json({ error: 'limit' }, { status: 409 });
          }
          try {
            const row = await prisma.versecraftSeedListing.create({
              data: { seed, title: body.title, authorId: userId },
              select: { id: true },
            });
            void screenNewContent({
              entityType: 'versecraft_seed',
              entityId: row.id,
              authorId: userId,
              text: body.title,
            });
            return Response.json({ id: row.id }, { status: 201 });
          } catch {
            return Response.json({ error: 'already-published' }, { status: 409 });
          }
        },
      ),
    },
  },
});
