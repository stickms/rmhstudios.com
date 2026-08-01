/**
 * Universal search — people.
 *
 * The one thing this module exists to get right: **a user is findable by the
 * name the site actually shows for them.** `resolveUser()` renders
 * `user_profile.displayName ?? user.name`, so for anyone who has ever set a
 * display name, `user.name` is a stale OAuth artifact nobody has seen. The old
 * query searched only `user.name`/`username`/`handle`, which is why looking
 * someone up by their display name returned nothing at all.
 *
 * Shared by `/api/search` and `/api/users/search` so the typeahead and the
 * search page can never disagree about who matches.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';
import { fuzzyAny, fuzzyTerms, sqlRank, type FuzzyTerms } from './db.server';
import { confidenceOf, scoreRecord, withPopularity, MATCH_FLOOR } from './score';
import type { SearchHit } from './types';

/**
 * How much a match on each field is worth. Handle and display name are what
 * people actually type; a bio match is a weak "this person talks about X"
 * signal and must never outrank a name.
 */
const WEIGHTS = {
  displayName: 1,
  name: 0.97,
  handle: 0.95,
  username: 0.9,
  bio: 0.45,
} as const;

/** Rows pulled from Postgres before JS re-ranking trims them to `limit`. */
const CANDIDATE_POOL = 80;

interface CandidateRow {
  id: string;
  name: string | null;
  username: string | null;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  follower_count: number;
}

export interface PeopleSearchOptions {
  limit?: number;
  /** Omit this user from results (the typeahead can't mention/DM you). */
  excludeUserId?: string | null;
  floor?: number;
}

export interface ScoredPerson {
  user: ResolvedUser;
  score: number;
  reason: ReturnType<typeof scoreRecord>['reason'];
}

/**
 * Fetch and rank people matching `terms`.
 *
 * Stage 1 casts a wide index-backed net across name, username, handle,
 * displayName and bio; stage 2 re-scores in JS so a query that is one *word* of
 * a long display name still ranks as the strong match it is.
 */
export async function searchPeopleScored(
  terms: FuzzyTerms,
  opts: PeopleSearchOptions = {},
): Promise<ScoredPerson[]> {
  if (!terms.q) return [];
  const limit = opts.limit ?? 10;
  const floor = opts.floor ?? MATCH_FLOOR;

  const nameCols = [
    Prisma.sql`u."name"`,
    Prisma.sql`u."username"`,
    Prisma.sql`u."handle"`,
    Prisma.sql`p."displayName"`,
  ];
  // Bio joins the recall net but not the ranking expression — a bio mention
  // shouldn't pull someone to the top of the candidate pool ahead of names.
  const recall = fuzzyAny([...nameCols, Prisma.sql`p."bio"`], terms, { perToken: true });
  const rank = sqlRank(nameCols, terms);
  const excludeClause = opts.excludeUserId
    ? Prisma.sql`AND u.id <> ${opts.excludeUserId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    SELECT u.id,
           u."name",
           u."username",
           u."handle",
           p."displayName" AS display_name,
           p."bio"         AS bio,
           u."followerCount" AS follower_count
    FROM "user" u
    LEFT JOIN "user_profile" p ON p."userId" = u.id
    WHERE ${recall}
      ${excludeClause}
    ORDER BY ${rank} DESC, u."followerCount" DESC
    LIMIT ${CANDIDATE_POOL}
  `);

  if (rows.length === 0) return [];

  const scored = rows
    .map((row) => {
      const { score, reason } = scoreRecord(terms.q, [
        { value: row.display_name, weight: WEIGHTS.displayName },
        { value: row.name, weight: WEIGHTS.name },
        { value: row.handle, weight: WEIGHTS.handle },
        { value: row.username, weight: WEIGHTS.username },
        { value: row.bio, weight: WEIGHTS.bio },
      ]);
      return { row, score: withPopularity(score, row.follower_count), reason };
    })
    .filter((r) => r.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return [];

  // Hydrate through Prisma so results carry the same shape (profile overrides,
  // equipped cosmetics) as every other surface that renders a user.
  const ids = scored.map((s) => s.row.id);
  const hydrated = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: userDisplaySelect,
  });
  const byId = new Map(hydrated.map((u) => [u.id, u]));

  return scored
    .map(({ row, score, reason }) => {
      const full = byId.get(row.id);
      return full ? { user: resolveUser(full), score, reason } : null;
    })
    .filter((r): r is ScoredPerson => r !== null);
}

/** Convenience wrapper for callers holding a raw query string. */
export async function searchPeople(
  rawQuery: string,
  opts: PeopleSearchOptions = {},
): Promise<ScoredPerson[]> {
  return searchPeopleScored(fuzzyTerms(rawQuery), opts);
}

/** Map a scored person onto the generic hit shape used by the "Top" tab. */
export function personToHit({ user, score, reason }: ScoredPerson): SearchHit {
  return {
    key: `person:${user.id}`,
    id: user.id,
    kind: 'person',
    title: user.name || user.handle || 'User',
    subtitle: user.handle ? `@${user.handle}` : undefined,
    href: `/u/${user.handle ?? user.id}`,
    image: user.image,
    score,
    confidence: confidenceOf(score),
    reason,
    meta: { isVerified: user.isVerified, isAdmin: user.isAdmin, cosmetics: user.cosmetics },
  };
}
