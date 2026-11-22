/**
 * `GET /api/v1/search/posts` and `GET /api/v1/search/people` (s08-14).
 *
 * Keyword search only: the semantic path spends embedding compute per call and is never reached from here. Both
 * endpoints run the site's own search (`searchPostsScored`, `searchPeopleScored`) with the query parsed by the site's
 * parser (`parseQuery`), so the operators, the public-only predicate and the private-community exclusion are the
 * site's. Posts come back through the shared v1 serialiser (`serializePublicPost`), so quiet counts, content warnings
 * and GIF descriptions apply as they do on `GET /api/v1/feed` (`countsHiddenFrom` runs inside the serialiser, with the key owner as viewer). Results depend on the key owner's blocks, so nothing
 * here is cached across keys.
 */
import { prisma, prismaRead } from '@/lib/prisma.server';
import { discoverableCommunityWhere } from '@/lib/communities/discovery';
import { parseQuery } from '@/lib/search/parse';
import { fuzzyTerms } from '@/lib/search/db.server';
import { searchPostsScored, resolveCommunityId, type ScoredPost } from '@/lib/search/posts.server';
import { searchPeopleScored } from '@/lib/search/people.server';
import { getBlockedAuthorIds, getHiddenAuthorIds } from '@/lib/moderation.server';
import { isDeletedAccount } from '@/lib/account-lifecycle';
import { userDisplaySelect } from '@/lib/user-display';
import { serializeAuthor, serializePublicPost } from '@/lib/api/serializers.server';
import { decodeSearchCursor, encodeSearchCursor, type SearchCursor } from '@/lib/api/v1/search-schema';

/** The post search ranks a pool this large; a ranked cursor pages inside it. */
const RANKED_POOL = 120;
const NO_MATCH = '__none__';

export type SearchResult<T> =
  | {
      ok: true;
      data: T[];
      nextCursor: string | null;
    }
  | {
      ok: false;
      message: string;
    };

/** A member the key owner must not see: banned now, deleted, or with a deletion scheduled. */
export function isHiddenAccount(u: {
  id?: string;
  banReason?: string | null;
  bannedUntil?: Date | null;
  deletionScheduledAt?: Date | null;
}): boolean {
  return (
    isDeletedAccount(u) ||
    u.deletionScheduledAt != null ||
    (u.bannedUntil != null && u.bannedUntil.getTime() > Date.now())
  );
}

const accountFlags = {
  banReason: true,
  bannedUntil: true,
  deletionScheduledAt: true,
} as const;

/** Order: score high first, then id high first (a total order, so a cursor is stable). */
function byScoreThenId(a: ScoredPost, b: ScoredPost): number {
  return b.score - a.score || (a.post.id < b.post.id ? 1 : a.post.id > b.post.id ? -1 : 0);
}

function afterRankedCursor(
  p: ScoredPost,
  c: {
    s: number;
    id: string;
  },
): boolean {
  return p.score < c.s || (p.score === c.s && p.post.id < c.id);
}

export async function searchPostsForKey(input: {
  q: string;
  limit: number;
  cursor?: string | undefined;
  userId: string;
}): Promise<SearchResult<ReturnType<typeof serializePublicPost>>> {
  let cursor: SearchCursor | null = null;
  if (input.cursor) {
    cursor = decodeSearchCursor(input.cursor);
    if (!cursor)
      return {
        ok: false,
        message: 'cursor is not valid.',
      };
  }

  const parsed = parseQuery(input.q);
  const text = parsed.text || (parsed.operatorCount > 0 ? '' : input.q);
  const terms = fuzzyTerms(text);
  const hasText = terms.q.length > 0;
  if (hasText && cursor && 's' in cursor === false)
    return {
      ok: false,
      message: 'cursor is not valid.',
    };
  if (!hasText && cursor && 't' in cursor === false)
    return {
      ok: false,
      message: 'cursor is not valid.',
    };

  const [hiddenAuthorIds, authorId, communityId] = await Promise.all([
    getHiddenAuthorIds(input.userId),
    parsed.from
      ? prismaRead.user
          .findFirst({
            where: {
              handle: parsed.from,
            },
            select: {
              id: true,
            },
          })
          .then((u) => u?.id ?? NO_MATCH)
      : Promise.resolve(null),
    parsed.inCommunity ? resolveCommunityId(parsed.inCommunity).then((id) => id ?? NO_MATCH) : Promise.resolve(null),
  ]);

  // Without free text the site returns newest first, so a page boundary is a point in time.
  let before = parsed.before;
  if (!hasText && cursor && 't' in cursor) {
    if (!before || Date.parse(cursor.t) < Date.parse(before)) before = cursor.t;
  }

  const scored = await searchPostsScored(terms, {
    limit: hasText ? RANKED_POOL : input.limit + 1,
    hiddenAuthorIds,
    lexicalOnly: true,
    authorId,
    communityId,
    before,
    after: parsed.after,
    hasMedia: parsed.hasMedia,
  });

  let ordered = scored;
  if (hasText) {
    ordered = [...scored].sort(byScoreThenId);
    if (cursor && 's' in cursor) {
      const c = cursor;
      ordered = ordered.filter((p) => afterRankedCursor(p, c));
    }
  }
  const pageHits = ordered.slice(0, input.limit);
  const hasMore = ordered.length > input.limit;
  const last = pageHits[pageHits.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeSearchCursor(
          hasText
            ? {
                s: last.score,
                id: last.post.id,
              }
            : {
                t: last.post.createdAt,
                id: last.post.id,
              },
        )
      : null;
  if (pageHits.length === 0)
    return {
      ok: true,
      data: [],
      nextCursor: null,
    };

  // Hydrate in the feed's shape; the site's candidate scan only carries what a hit card needs.
  const ids = pageHits.map((h) => h.post.id);
  const rows = await prisma.rMHark.findMany({
    where: {
      id: {
        in: ids,
      },
      deletedAt: null,
      audience: 'PUBLIC',
      unlockPrice: null,
      OR: [
        {
          communityId: null,
        },
        {
          community: discoverableCommunityWhere({ isPrivate: false }),
        },
      ],
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      likeCount: true,
      commentCount: true,
      repostCount: true,
      viewCount: true,
      imageUrls: true,
      imageAlts: true,
      gifUrl: true,
      gifAlt: true,
      isSensitive: true,
      contentWarning: true,
      pinnedCommentId: true,
      user: {
        select: {
          ...userDisplaySelect,
          ...accountFlags,
        },
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const hidden = new Set(hiddenAuthorIds);
  const data = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .filter((r) => !hidden.has(r.user.id) && !isHiddenAccount(r.user))
    .map((r) => serializePublicPost(r, input.userId));
  return {
    ok: true,
    data,
    nextCursor,
  };
}

export async function searchPeopleForKey(input: { q: string; limit: number; userId: string }) {
  const parsed = parseQuery(input.q);
  const text = parsed.text || (parsed.operatorCount > 0 ? '' : input.q);
  const terms = fuzzyTerms(text);
  if (!terms.q)
    return {
      data: [] as PersonResult[],
      nextCursor: null,
    };

  const blocked = new Set(await getBlockedAuthorIds(input.userId));
  // The site search does not drop banned or deletion-scheduled accounts, so over-fetch and filter here.
  const found = await searchPeopleScored(terms, {
    limit: Math.min(input.limit * 2, 50),
  });
  const candidates = found.filter((f) => !blocked.has(f.user.id));
  if (candidates.length === 0)
    return {
      data: [] as PersonResult[],
      nextCursor: null,
    };

  const rows = await prisma.user.findMany({
    where: {
      id: {
        in: candidates.map((c) => c.user.id),
      },
    },
    select: {
      ...userDisplaySelect,
      ...accountFlags,
      createdAt: true,
      profile: {
        select: {
          displayName: true,
          customImage: true,
          bio: true,
          location: true,
          website: true,
        },
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const data: PersonResult[] = [];
  for (const c of candidates) {
    const row = byId.get(c.user.id);
    if (!row || isHiddenAccount(row)) continue;
    data.push({
      ...serializeAuthor(row),
      bio: row.profile?.bio ?? null,
      location: row.profile?.location ?? null,
      website: row.profile?.website ?? null,
      createdAt: row.createdAt,
    });
    if (data.length === input.limit) break;
  }
  return {
    data,
    nextCursor: null,
  };
}

export type PersonResult = ReturnType<typeof serializeAuthor> & {
  bio: string | null;
  location: string | null;
  website: string | null;
  createdAt: Date;
};
