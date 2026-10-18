import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { rateSeedSchema } from '@/lib/versecraft/seed-gallery';

/** POST /api/versecraft/seeds/rate — rate someone else's seed 1–5 (replaces your earlier stars). */
export const Route = createFileRoute('/api/versecraft/seeds/rate')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: rateSeedSchema },
        async ({ userId, body }) => {
          const listing = await prisma.versecraftSeedListing.findUnique({
            where: { id: body.listingId },
            select: { authorId: true },
          });
          if (!listing) return Response.json({ error: 'not-found' }, { status: 404 });
          if (listing.authorId === userId)
            return Response.json({ error: 'own-seed' }, { status: 403 });

          const where = { listingId_userId: { listingId: body.listingId, userId } };
          const updated = await prisma.$transaction(async (tx) => {
            const prev = await tx.versecraftSeedRating.findUnique({
              where,
              select: { stars: true },
            });
            await tx.versecraftSeedRating.upsert({
              where,
              create: { listingId: body.listingId, userId, stars: body.stars },
              update: { stars: body.stars },
            });
            return tx.versecraftSeedListing.update({
              where: { id: body.listingId },
              data: {
                ratingSum: { increment: body.stars - (prev?.stars ?? 0) },
                ratingCount: { increment: prev ? 0 : 1 },
              },
              select: { ratingSum: true, ratingCount: true },
            });
          });
          return Response.json({
            average: Math.round((updated.ratingSum / updated.ratingCount) * 10) / 10,
            ratingCount: updated.ratingCount,
          });
        },
      ),
    },
  },
});
