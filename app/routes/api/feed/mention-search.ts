import { createFileRoute } from '@tanstack/react-router';
import { Prisma } from '@prisma/client';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { norm } from '@/lib/search/db.server';
import { normalizeQuery } from '@/lib/search/normalize';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/** Cap on follower ids read for ranking (newest first) — the graph can be huge. */
const FOLLOWER_ID_CAP = 2000;

async function searchMentionUsers(q: string, viewerId: string | undefined) {
  // Build the viewer's follow graph for ranking. The following side comes from
  // the shared cached helper; followers are bounded to the newest N.
  let followingIds = new Set<string>();
  let followerIds = new Set<string>();
  if (viewerId) {
    const [following, followers] = await Promise.all([
      getFollowingIds(viewerId),
      prisma.follow.findMany({
        where: { followingId: viewerId },
        select: { followerId: true },
        orderBy: { createdAt: 'desc' },
        take: FOLLOWER_ID_CAP,
      }),
    ]);
    followingIds = new Set(following);
    followerIds = new Set(followers.map((f) => f.followerId));
  }

  // Pull a generous candidate set, then rank in app memory and trim to a
  // bounded list so a popular prefix can't flood the dropdown.
  let candidates;
  if (q) {
    // perf: `contains insensitive` compiled to ILIKE and seq-scanned "user".
    // Match through rmh_search_norm() exactly like /api/search so the
    // *_norm_trgm_idx GIN indexes serve the substring predicate.
    const needle = `%${normalizeQuery(q).replace(/[\\%_]/g, '\\$&')}%`;
    const viewerClause = viewerId ? Prisma.sql`AND "id" <> ${viewerId}` : Prisma.empty;
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "user"
      WHERE "handle" IS NOT NULL ${viewerClause}
        AND (${norm(Prisma.raw('"handle"'))} LIKE ${needle}
          OR ${norm(Prisma.raw('"username"'))} LIKE ${needle}
          OR ${norm(Prisma.raw('"name"'))} LIKE ${needle})
      LIMIT 50`);
    candidates = rows.length
      ? await prisma.user.findMany({
          where: { id: { in: rows.map((r) => r.id) } },
          select: userDisplaySelect,
        })
      : [];
  } else if (viewerId) {
    // No query yet: only suggest people in the viewer's graph.
    const graphIds = [...new Set([...followingIds, ...followerIds])].filter((id) => id !== viewerId);
    candidates = graphIds.length
      ? await prisma.user.findMany({
          where: { id: { in: graphIds }, handle: { not: null } },
          select: userDisplaySelect,
          take: 50,
        })
      : [];
  } else {
    candidates = await prisma.user.findMany({
      where: { handle: { not: null } },
      select: userDisplaySelect,
      take: 50,
    });
  }

  const score = (id: string) => {
    const f = followingIds.has(id);
    const b = followerIds.has(id);
    if (f && b) return 3; // mutual / "friend"
    if (f) return 2; // viewer follows them
    if (b) return 1; // follows the viewer
    return 0;
  };

  const exact = q.toLowerCase();
  return candidates
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
}

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
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: {
            limit: 40,
            windowMs: 60_000,
            prefix: 'mention-search',
            message: 'Rate limited',
          },
        },
        async ({ request }) => {
          const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';

          const session = await auth.api.getSession({ headers: request.headers });
          const viewerId = session?.user?.id;

          // perf: autocomplete fires per keystroke; a ~30s per-(viewer,q) cache
          // absorbs repeat prefixes/backspacing. Cost: follow-graph changes take
          // up to 30s to affect ranking.
          const users = await cached(
            `mention-search:${viewerId ?? 'anon'}:${q.toLowerCase()}`,
            30_000,
            () => searchMentionUsers(q, viewerId),
          );

          return Response.json({ users });
        },
      ),
    },
  },
});
