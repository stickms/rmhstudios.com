import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Viewer-aware user suggestions for `@mention` autocomplete.
 *
 * Ranking: mutual follows ("friends") first, then accounts the viewer follows,
 * then everyone else — so the people you actually talk to surface before
 * strangers. Only users with a `handle` are returned, since a mention needs one.
 * An empty query returns the viewer's friends/following as default suggestions.
 */
export const Route = createFileRoute('/api/feed/mention-search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 40, windowMs: 60_000, prefix: 'mention-search' });
        if (!allowed) return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 });

        const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';

        const session = await auth.api.getSession({ headers: request.headers });
        const viewerId = session?.user?.id;

        // Build the viewer's follow graph for ranking.
        let followingIds = new Set<string>();
        let followerIds = new Set<string>();
        if (viewerId) {
          const [following, followers] = await Promise.all([
            prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }),
            prisma.follow.findMany({ where: { followingId: viewerId }, select: { followerId: true } }),
          ]);
          followingIds = new Set(following.map((f) => f.followingId));
          followerIds = new Set(followers.map((f) => f.followerId));
        }

        const where = {
          handle: { not: null },
          ...(viewerId ? { id: { not: viewerId } } : {}),
          ...(q
            ? {
                OR: [
                  { handle: { contains: q, mode: 'insensitive' as const } },
                  { username: { contains: q, mode: 'insensitive' as const } },
                  { name: { contains: q, mode: 'insensitive' as const } },
                ],
              }
            : viewerId
              // No query yet: only suggest people in the viewer's graph.
              ? { id: { in: [...new Set([...followingIds, ...followerIds])] } }
              : {}),
        };

        // Pull a generous candidate set, then rank in app memory and trim to a
        // bounded list so a popular prefix can't flood the dropdown.
        const candidates = await prisma.user.findMany({
          where,
          select: userDisplaySelect,
          take: 50,
        });

        const score = (id: string) => {
          const f = followingIds.has(id);
          const b = followerIds.has(id);
          if (f && b) return 3; // mutual / "friend"
          if (f) return 2; // viewer follows them
          if (b) return 1; // follows the viewer
          return 0;
        };

        const exact = q.toLowerCase();
        const users = candidates
          .map(resolveUser)
          .sort((a, b) => {
            // Exact handle match wins outright.
            const ax = a.handle?.toLowerCase() === exact ? 1 : 0;
            const bx = b.handle?.toLowerCase() === exact ? 1 : 0;
            if (ax !== bx) return bx - ax;
            const sd = score(b.id) - score(a.id);
            if (sd !== 0) return sd;
            return (a.handle ?? '').localeCompare(b.handle ?? '');
          })
          .slice(0, 15);

        return Response.json({ users });
      },
    },
  },
});
