import { createFileRoute } from '@tanstack/react-router';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { parseQuery } from '@/lib/search/parse';

/** Cap on results per category (was 30 for the focused tab). */
const MAX = 25;

/**
 * People search via the pg_trgm GIN indexes on lower(name)/lower(username)/
 * lower(handle). `%` gives typo tolerance; the prefix LIKE keeps short/exact
 * prefixes matching. Returns display-resolved users in similarity order.
 * Fully parameterised — no user input is concatenated into SQL.
 */
async function searchPeople(q: string, take: number) {
  const qLower = q.toLowerCase();
  const prefix = qLower.replace(/[\\%_]/g, '\\$&') + '%';
  const matches = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id
    FROM "user"
    WHERE (
      lower(name) % ${qLower} OR lower(name) LIKE ${prefix}
      OR lower(username) % ${qLower} OR lower(username) LIKE ${prefix}
      OR lower(handle) % ${qLower} OR lower(handle) LIKE ${prefix}
    )
    ORDER BY GREATEST(
      COALESCE(similarity(lower(name), ${qLower}), 0),
      COALESCE(similarity(lower(username), ${qLower}), 0),
      COALESCE(similarity(lower(handle), ${qLower}), 0)
    ) DESC
    LIMIT ${take}
  `);
  if (matches.length === 0) return [];
  const ids = matches.map((m) => m.id);
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: userDisplaySelect,
  });
  const byId = new Map(rows.map((u) => [u.id, u]));
  return ids
    .map((id) => byId.get(id))
    .filter((u): u is (typeof rows)[number] => Boolean(u))
    .map((u) => resolveUser(u));
}

/**
 * Post search via the `content_tsv` full-text column (rmheet_content_tsv_idx),
 * matched with `websearch_to_tsquery('simple', q)`. The raw query returns ids
 * (ordered by engagement) that are then hydrated through Prisma with the normal
 * select. `content_tsv` isn't in schema.prisma (raw-SQL migration), hence
 * $queryRaw. Fully parameterised.
 */
async function searchPosts(
  q: string,
  hiddenIds: string[],
  take: number,
  opts: { authorId?: string | null; before?: string; after?: string } = {},
) {
  const hiddenClause = hiddenIds.length
    ? Prisma.sql`AND "userId" NOT IN (${Prisma.join(hiddenIds)})`
    : Prisma.empty;
  // Free text is optional when operators are present (e.g. `from:@x`).
  const ftsClause = q ? Prisma.sql`AND content_tsv @@ websearch_to_tsquery('simple', ${q})` : Prisma.empty;
  const authorClause = opts.authorId ? Prisma.sql`AND "userId" = ${opts.authorId}` : Prisma.empty;
  const beforeClause = opts.before ? Prisma.sql`AND "createdAt" < ${new Date(opts.before)}` : Prisma.empty;
  const afterClause = opts.after ? Prisma.sql`AND "createdAt" >= ${new Date(opts.after)}` : Prisma.empty;
  const matches = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id
    FROM rmheet
    WHERE "deletedAt" IS NULL
      ${ftsClause}
      AND audience = 'PUBLIC'
      AND "unlockPrice" IS NULL
      ${authorClause}
      ${beforeClause}
      ${afterClause}
      ${hiddenClause}
    ORDER BY "likeCount" DESC, "createdAt" DESC
    LIMIT ${take}
  `);
  if (matches.length === 0) return [];
  const ids = matches.map((m) => m.id);
  const rows = await prisma.rMHark.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      content: true,
      createdAt: true,
      likeCount: true,
      user: { select: userDisplaySelect },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is (typeof rows)[number] => Boolean(r))
    .map((p) => ({
      id: p.id,
      content: p.content,
      createdAt: p.createdAt.toISOString(),
      likeCount: p.likeCount,
      user: resolveUser(p.user),
    }));
}

/**
 * GET /api/search?q=...&type=all|people|posts|builds|blog
 *
 * Unified search across people, posts, user builds, and blog posts. Returns a
 * grouped payload so the search page can render tabs without extra round-trips.
 * Requires a session and is rate-limited — search runs several DB scans and
 * bypasses the anonymous page cache, so it must not be an anon DoS surface.
 */
export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        // Generous limit so normal use is never throttled: base 60 ×
        // RATE_LIMIT_MULTIPLIER (default 4) → ~240 req/min per IP.
        const { allowed } = await checkRateLimit(getClientIp(request), {
          limit: 60,
          windowMs: 60_000,
          prefix: 'search',
        });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        const url = new URL(request.url);
        const rawQ = url.searchParams.get('q')?.trim();
        const type = url.searchParams.get('type') ?? 'all';
        if (!rawQ || rawQ.length < 2) {
          return Response.json({ people: [], posts: [], builds: [], blog: [] });
        }

        // §18: parse operators (from:/before:/after:/has:media/in:). The free
        // text drives FTS; operators refine the posts query.
        const parsed = parseQuery(rawQ);
        // A query with operators but no text is still valid (e.g. `from:@x`).
        const q = parsed.text || (parsed.operatorCount > 0 ? '' : rawQ);
        const postAuthorId = parsed.from
          ? (
              await prisma.user.findFirst({ where: { handle: parsed.from }, select: { id: true } })
            )?.id ?? '__none__'
          : null;

        const viewerId = session.user.id;
        // Non-post categories use the free-text part (operators don't apply there).
        const containsTerm = q || rawQ;
        const contains = { contains: containsTerm, mode: 'insensitive' as const };

        const wantPeople = type === 'all' || type === 'people';
        const wantPosts = type === 'all' || type === 'posts';
        const wantBuilds = type === 'all' || type === 'builds';
        const wantBlog = type === 'all' || type === 'blog';

        try {
          const hiddenIds = wantPosts ? await getHiddenAuthorIds(viewerId) : [];

          const [people, posts, builds, blog] = await Promise.all([
            wantPeople && q ? searchPeople(q, type === 'people' ? MAX : 6) : Promise.resolve([]),
            wantPosts
              ? searchPosts(q, hiddenIds, type === 'posts' ? MAX : 6, {
                  authorId: postAuthorId,
                  before: parsed.before,
                  after: parsed.after,
                })
              : Promise.resolve([]),
            wantBuilds
              ? prisma.userBuild.findMany({
                  where: {
                    visibility: 'PUBLIC',
                    OR: [{ title: contains }, { description: contains }],
                  },
                  orderBy: { publishedAt: 'desc' },
                  take: type === 'builds' ? MAX : 6,
                  select: { slug: true, title: true, description: true },
                })
              : Promise.resolve([]),
            wantBlog
              ? prisma.blogPost.findMany({
                  where: { OR: [{ title: contains }, { description: contains }] },
                  orderBy: { createdAt: 'desc' },
                  take: type === 'blog' ? MAX : 5,
                  select: { slug: true, title: true, description: true },
                })
              : Promise.resolve([]),
          ]);

          return Response.json({ people, posts, builds, blog });
        } catch (error) {
          console.error('Search error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
