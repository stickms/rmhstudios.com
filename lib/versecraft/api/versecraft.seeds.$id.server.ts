import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { deleteVersecraftSeedApi } from '@/lib/versecraft/versecraft.contract';

/**
 * DELETE /api/versecraft/seeds/:id — the author takes their own story down (s15-04).
 *
 * The listing and its ratings go; the world stays, because other players' saves may be on it. The same seed can be
 * published again, and the author's cap (`MAX_LISTINGS_PER_AUTHOR`) has a slot back at once. A listing a moderator removed keeps its record, so its author cannot delete it (the answer is
 * the removed-by-a-moderator refusal); a listing that is missing or someone else's is the same 404, so ids cannot be
 * probed.
 */
export const route = apiRoute('/api/versecraft/seeds/$id', {
  DELETE: implement(deleteVersecraftSeedApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const outcome = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `versecraft-seed:${params.id}`);
      const listing = await tx.versecraftSeedListing.findUnique({
        where: { id: params.id },
        select: { authorId: true, moderatedAt: true },
      });
      if (!listing || listing.authorId !== userId) return 'not-found' as const;
      if (listing.moderatedAt) return 'removed' as const;
      await tx.versecraftSeedRating.deleteMany({ where: { listingId: params.id } });
      // Compare-and-set: the delete repeats the conditions the check above read.
      const done = await tx.versecraftSeedListing.deleteMany({
        where: { id: params.id, authorId: userId, moderatedAt: null },
      });
      return done.count === 1 ? ('deleted' as const) : ('not-found' as const);
    });
    if (outcome === 'removed') {
      return Response.json(refusalBody('GAME_CONTENT_REMOVED_BY_MODERATOR'), { status: 409 });
    }
    if (outcome === 'not-found') return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
    return Response.json({ success: true });
  }),
});
