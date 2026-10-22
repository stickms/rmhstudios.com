import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { norm } from '@/lib/search/db.server';
import { normalizeQuery } from '@/lib/search/normalize';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/** Newest follow edges read per direction for the empty-query default suggestions. */
const DEFAULT_SUGGESTION_EDGES = 50;
/** Newest follow edges per direction the typed-query candidate search considers. */
const MENTION_EDGE_CAP = 2000;

export async function searchMentionUsers(q: string, viewerId: string | undefined) {
  // perf: ranking only needs the viewer's relation to the <=50 candidates, so it is read for exactly those ids
  // (two index-backed edge lookups) instead of loading every follower and followee into memory first.
  let candidates;
  if (q) {
    // perf: `contains insensitive` compiled to ILIKE and seq-scanned "user".
    // Match through rmh_search_norm() exactly like /api/search so the
    // *_norm_trgm_idx GIN indexes serve the substring predicate.
    const needle = `%${normalizeQuery(q).replace(/[\\%_]/g, '\\$&')}%`;
    const viewerClause = viewerId ? Prisma.sql`AND "id" <> ${viewerId}` : Prisma.empty;
    // The LIMIT must keep the best candidates, not an arbitrary 50. The old query ORDERed BY two correlated EXISTS
    // per matching row before LIMIT, which for a 1-3 char needle (matches nearly everyone) ran ~40k probes (86 ms
    // vs 40 ms here at 20k users, and growing with the table). Instead: the best 50 by the cheap keys (exact
    // handle, then handle/id), UNION the best 50 of the viewer's own follow edges that match (mutual > following >
    // follower). The edges are read once per direction, newest MENTION_EDGE_CAP each, never per matching row. The
    // ranker below re-sorts the union with the same signals, so the final 15 are unchanged.
    const match = Prisma.sql`"handle" IS NOT NULL ${viewerClause}
        AND (${norm(Prisma.raw('"handle"'))} LIKE ${needle}
          OR ${norm(Prisma.raw('"username"'))} LIKE ${needle}
          OR ${norm(Prisma.raw('"name"'))} LIKE ${needle})`;
    const exactKey = q.toLowerCase();
    const related = viewerId
      ? Prisma.sql`, rel AS (
          SELECT m."id" FROM m JOIN (
            SELECT "id", SUM(s) AS score FROM (
              (SELECT "followingId" AS "id", 2 AS s FROM "follow" WHERE "followerId" = ${viewerId}
                ORDER BY "createdAt" DESC LIMIT ${MENTION_EDGE_CAP})
              UNION ALL
              (SELECT "followerId" AS "id", 1 AS s FROM "follow" WHERE "followingId" = ${viewerId}
                ORDER BY "createdAt" DESC LIMIT ${MENTION_EDGE_CAP})
            ) e GROUP BY "id"
          ) edges ON edges."id" = m."id"
          ORDER BY (lower(m."handle") = ${exactKey}) DESC, edges.score DESC, m."handle" ASC, m."id" ASC
          LIMIT 50)`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH m AS (SELECT "id", "handle" FROM "user" WHERE ${match}),
      top AS (
        SELECT "id" FROM m
        ORDER BY (lower("handle") = ${exactKey}) DESC, "handle" ASC, "id" ASC
        LIMIT 50)
      ${related}
      SELECT "id" FROM top ${viewerId ? Prisma.sql`UNION SELECT "id" FROM rel` : Prisma.empty}`);
    candidates = rows.length
      ? await prisma.user.findMany({
          where: { id: { in: rows.map((r) => r.id) } },
          select: userDisplaySelect,
        })
      : [];
  } else if (viewerId) {
    // No query yet: suggest the viewer's most recent follow edges in both directions.
    const [out, inc] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: viewerId },
        select: { followingId: true },
        orderBy: { createdAt: 'desc' },
        take: DEFAULT_SUGGESTION_EDGES,
      }),
      prisma.follow.findMany({
        where: { followingId: viewerId },
        select: { followerId: true },
        orderBy: { createdAt: 'desc' },
        take: DEFAULT_SUGGESTION_EDGES,
      }),
    ]);
    // Up to 100 distinct ids; cap at 50 keeping the strongest ties (mutuals, then follows, then followers)
    // rather than letting the database drop an arbitrary half before ranking.
    const outIds = out.map((f) => f.followingId);
    const incIds = inc.map((f) => f.followerId);
    const incSet = new Set(incIds);
    const outSet = new Set(outIds);
    const graphIds = [
      ...new Set([
        ...outIds.filter((id) => incSet.has(id)),
        ...outIds.filter((id) => !incSet.has(id)),
        ...incIds.filter((id) => !outSet.has(id)),
      ]),
    ]
      .filter((id) => id !== viewerId)
      .slice(0, 50);
    candidates = graphIds.length
      ? await prisma.user.findMany({
          where: { id: { in: graphIds }, handle: { not: null } },
          select: userDisplaySelect,
        })
      : [];
  } else {
    candidates = await prisma.user.findMany({
      where: { handle: { not: null } },
      select: userDisplaySelect,
      orderBy: [{ followerCount: 'desc' }, { id: 'asc' }],
      take: 50,
    });
  }

  const followingIds = new Set<string>();
  const followerIds = new Set<string>();
  if (viewerId && candidates.length) {
    const ids = candidates.map((c) => c.id);
    const edges = await prisma.follow.findMany({
      where: {
        OR: [
          { followerId: viewerId, followingId: { in: ids } },
          { followingId: viewerId, followerId: { in: ids } },
        ],
      },
      select: { followerId: true, followingId: true },
    });
    for (const e of edges) {
      if (e.followerId === viewerId) followingIds.add(e.followingId);
      else followerIds.add(e.followerId);
    }
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
