import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { screenNewContent } from '@/lib/moderation/auto-moderate.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { notBannedWhere } from '@/lib/moderation/workshop-moderation';
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
export const route = apiRoute('/api/versecraft/seeds', {
  GET: defineHandler(
    { auth: 'optional', rateLimit: 'read', query: listSeedsQuerySchema },
    async ({ userId, query }) => {
      // The gallery leaves out removed stories and those by banned authors and by members blocked either way.
      const hidden = await getHiddenAuthorIds(userId);
      const rows = await prisma.versecraftSeedListing.findMany({
        where: { moderatedAt: null, authorId: { notIn: hidden }, author: notBannedWhere(new Date()) },
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
  POST: defineHandler({ rateLimit: 'write', body: publishSeedSchema }, async ({ userId, body }) => {
    const seed = normalizeSeed(body.seed);
    // Only a world that really exists can be continued by someone else.
    const world = await prisma.versecraftWorld.findUnique({
      where: { seed },
      select: { seed: true },
    });
    if (!world) return Response.json({ error: 'unknown-seed' }, { status: 404 });
    // A story a moderator removed stops counting toward the cap (its author cannot delete it, so it would never free).
    const count = await prisma.versecraftSeedListing.count({ where: { authorId: userId, moderatedAt: null } });
    if (count >= MAX_LISTINGS_PER_AUTHOR) {
      return Response.json({ error: 'limit' }, { status: 409 });
    }
    try {
      const row = await prisma.versecraftSeedListing.create({
        data: { seed, title: body.title, authorId: userId },
        select: { id: true },
      });
      void screenNewContent({
        // The report type (s15-04), so an automated flag gets the queue preview and the takedown a member's report gets.
        entityType: 'versecraft-seed',
        entityId: row.id,
        authorId: userId,
        text: body.title,
      });
      return Response.json({ id: row.id }, { status: 201 });
    } catch {
      return Response.json({ error: 'already-published' }, { status: 409 });
    }
  }),
});
