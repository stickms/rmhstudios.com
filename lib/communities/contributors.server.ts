/**
 * N7 — top contributors (server-only).
 *
 * "Helpfulness", not post counts. The signals that exist on this site:
 *  - starboarded posts (a post at or above the community's star threshold),
 *  - challenge wins.
 * There is no accepted-answer / "marked helpful" mechanism on replies, so that
 * third signal from the plan is deliberately absent rather than faked.
 *
 * A daily worker rebuilds the small `community_contributor_score` table per
 * community; the page reads the top rows from it. Reads never aggregate.
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export const STAR_POST_POINTS = 3;
export const CHALLENGE_WIN_POINTS = 10;
export const CONTRIBUTORS_SHOWN = 10;

export function contributorScore(starPosts: number, challengeWins: number): number {
  return starPosts * STAR_POST_POINTS + challengeWins * CHALLENGE_WIN_POINTS;
}

export interface ContributorDTO {
  user: ReturnType<typeof resolveUser>;
  starPosts: number;
  challengeWins: number;
  score: number;
  roleTags: string[];
}

const TTL_MS = 5 * 60_000;
const key = (communityId: string) => `community:contributors:${communityId}`;

export async function getTopContributors(communityId: string): Promise<ContributorDTO[]> {
  const hit = apiCache.get<ContributorDTO[]>(key(communityId));
  if (hit) return hit;
  const rows = await prisma.communityContributorScore.findMany({
    where: { communityId, score: { gt: 0 } },
    orderBy: [{ score: 'desc' }, { userId: 'asc' }],
    take: CONTRIBUTORS_SHOWN,
    include: { user: { select: userDisplaySelect } },
  });
  const members = rows.length
    ? await prisma.communityMember.findMany({
        where: { communityId, userId: { in: rows.map((r) => r.userId) } },
        select: { userId: true, roleTags: true },
      })
    : [];
  const tags = new Map(members.map((m) => [m.userId, m.roleTags]));
  const out = rows.map((r) => ({
    user: resolveUser(r.user),
    starPosts: r.starPosts,
    challengeWins: r.challengeWins,
    score: r.score,
    roleTags: tags.get(r.userId) ?? [],
  }));
  apiCache.set(key(communityId), out, TTL_MS);
  return out;
}

/**
 * Rebuild one community's scores. Two grouped reads (bounded by the number of
 * qualifying posts / challenges) and one replace, in a transaction.
 */
export async function rebuildCommunityScores(communityId: string): Promise<number> {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { starThreshold: true },
  });
  if (!community) return 0;

  const [stars, wins] = await Promise.all([
    prisma.$queryRaw<{ userId: string; n: number }[]>`
      SELECT r."userId", COUNT(*)::int AS n
      FROM community_star_post s
      JOIN rmheet r ON r.id = s."postId"
      WHERE s."communityId" = ${communityId}
        AND s."starCount" >= ${community.starThreshold}
        AND r."deletedAt" IS NULL
      GROUP BY r."userId"
    `,
    prisma.$queryRaw<{ userId: string; n: number }[]>`
      SELECT e."userId", COUNT(*)::int AS n
      FROM community_challenge c
      JOIN community_challenge_entry e ON e.id = c."winnerEntryId"
      WHERE c."communityId" = ${communityId}
      GROUP BY e."userId"
    `,
  ]);

  const byUser = new Map<string, { starPosts: number; challengeWins: number }>();
  for (const s of stars) byUser.set(s.userId, { starPosts: s.n, challengeWins: 0 });
  for (const w of wins) {
    const cur = byUser.get(w.userId) ?? { starPosts: 0, challengeWins: 0 };
    cur.challengeWins = w.n;
    byUser.set(w.userId, cur);
  }

  await prisma.$transaction([
    prisma.communityContributorScore.deleteMany({ where: { communityId } }),
    prisma.communityContributorScore.createMany({
      data: [...byUser.entries()].map(([userId, v]) => ({
        communityId,
        userId,
        starPosts: v.starPosts,
        challengeWins: v.challengeWins,
        score: contributorScore(v.starPosts, v.challengeWins),
      })),
    }),
  ]);
  apiCache.invalidate(key(communityId));
  return byUser.size;
}

/**
 * Daily job body: rebuild communities that have any star or challenge activity.
 * Walks communities in id order in bounded batches so a long run can't hold a
 * connection or starve the pool.
 */
export async function rebuildAllContributorScores(): Promise<number> {
  let cursor: string | undefined;
  let rebuilt = 0;
  for (;;) {
    const batch = await prisma.community.findMany({
      where: { OR: [{ starPostsP06: { some: {} } }, { challengesP06: { some: {} } }] },
      orderBy: { id: 'asc' },
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true },
    });
    if (batch.length === 0) break;
    for (const c of batch) {
      try {
        await rebuildCommunityScores(c.id);
        rebuilt++;
      } catch (e) {
        console.error('contributor rebuild error:', e);
      }
    }
    cursor = batch[batch.length - 1]?.id;
    if (batch.length < 100) break;
  }
  return rebuilt;
}
