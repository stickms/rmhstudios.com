import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions, isLocked } from '@/lib/feed/map-feed-item.server';
import { canReadThread } from '@/lib/feed/audience.server';
import { rankSimilar } from '@/lib/feed/similarity';
import { getHiddenAuthorIdsStrict } from '@/lib/moderation.server';
import { tokenize } from '@/lib/feed/similarity';

/**
 * GET /api/rmharks/$id/similar — posts topically similar to this one
 * (TF-IDF cosine over a recent candidate pool). Lexical "find similar".
 */
export const Route = createFileRoute('/api/rmharks/$id/similar')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const viewerId = session?.user?.id ?? null;

          const source = await prisma.rMHark.findUnique({
            where: { id: params.id },
            select: {
              content: true,
              deletedAt: true,
              userId: true,
              audience: true,
              communityId: true,
              unlockPrice: true,
              ...(viewerId ? { unlocks: { where: { userId: viewerId }, select: { id: true } } } : {}),
            },
          });
          // The source's text drives the ranking, so "similar to X" is a topic oracle
          // for X: gate it like reading X (private / blocked / priced-and-locked all 404).
          if (!source || !(await canReadThread(source, viewerId)) || isLocked(source, viewerId)) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
          if (!source.content.trim()) return Response.json({ items: [] });

          const hidden = await getHiddenAuthorIdsStrict(viewerId);
          // Pull a candidate pool that shares at least one salient term, then
          // rank precisely in-memory. Cheap and good enough for short posts.
          const terms = tokenize(source.content).slice(0, 8);
          if (terms.length === 0) return Response.json({ items: [] });

          const candidates = await prisma.rMHark.findMany({
            where: {
              id: { not: params.id },
              deletedAt: null,
              audience: 'PUBLIC',
              unlockPrice: null,
              communityId: null,
              ...(hidden.length ? { userId: { notIn: hidden } } : {}),
              OR: terms.map((t) => ({ content: { contains: t, mode: 'insensitive' as const } })),
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
            include: rmharkIncludeLite(viewerId),
          });

          const ranked = rankSimilar(
            source.content,
            candidates.map((c) => ({ doc: c, text: c.content })),
            5,
          );

          return Response.json({
            items: await mapRmharksWithBoundedReactions(
              ranked.map((r) => r.doc),
              viewerId,
            ),
          });
        } catch (error) {
          console.error('Similar posts error:', error);
          return Response.json({ items: [] });
        }
      },
    },
  },
});
