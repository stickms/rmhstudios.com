/**
 * Universal search — posts (RMHarks).
 *
 * Posts are the only corpus large enough that recall has to stay index-shaped:
 * full-text search on the generated `content_tsv` column does the heavy lifting,
 * with a trigram pass beside it to catch what FTS structurally cannot — partial
 * words, and typos. The `'simple'` text-search config does no stemming, so
 * without that second pass "recomend" or "kowloo" match nothing at all.
 *
 * `from:` / `before:` / `after:` / `has:media` / `in:` operators are applied
 * here; `lib/search/parse.ts` turns the raw query into them.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { fuzzyColumn, norm, type FuzzyTerms } from './db.server';
import { confidenceOf, scoreRecord, withPopularity, withRecency, MATCH_FLOOR } from './score';
import type { LegacyPost, SearchHit } from './types';

const CANDIDATE_POOL = 120;

export interface PostSearchFilters {
  authorId?: string | null;
  communityId?: string | null;
  before?: string;
  after?: string;
  hasMedia?: boolean;
}

export interface PostSearchOptions extends PostSearchFilters {
  limit?: number;
  hiddenAuthorIds?: string[];
  floor?: number;
}

export interface ScoredPost {
  post: LegacyPost;
  score: number;
  reason: ReturnType<typeof scoreRecord>['reason'];
}

/**
 * Rank posts for `terms`.
 *
 * A query with operators but no free text (`from:@ada has:media`) is valid and
 * returns that author's media posts in recency order — there is nothing to score
 * against, so every hit gets a neutral score rather than being filtered out.
 */
export async function searchPostsScored(
  terms: FuzzyTerms,
  opts: PostSearchOptions = {},
): Promise<ScoredPost[]> {
  const limit = opts.limit ?? 10;
  const floor = opts.floor ?? MATCH_FLOOR;
  const hidden = opts.hiddenAuthorIds ?? [];
  const hasText = terms.q.length > 0;

  const filters: Prisma.Sql[] = [
    Prisma.sql`"deletedAt" IS NULL`,
    Prisma.sql`audience = 'PUBLIC'`,
    Prisma.sql`"unlockPrice" IS NULL`,
  ];
  if (hasText) {
    // FTS handles multi-word intent; the trigram column catches partial words
    // and typos that `websearch_to_tsquery` can't express.
    filters.push(
      Prisma.sql`(content_tsv @@ websearch_to_tsquery('simple', ${terms.q})
        OR ${fuzzyColumn(Prisma.sql`"content"`, terms)})`,
    );
  }
  if (opts.authorId) filters.push(Prisma.sql`"userId" = ${opts.authorId}`);
  if (opts.communityId) filters.push(Prisma.sql`"communityId" = ${opts.communityId}`);
  if (opts.before) filters.push(Prisma.sql`"createdAt" < ${new Date(opts.before)}`);
  if (opts.after) filters.push(Prisma.sql`"createdAt" >= ${new Date(opts.after)}`);
  if (opts.hasMedia) filters.push(Prisma.sql`array_length("imageUrls", 1) > 0`);
  if (hidden.length) filters.push(Prisma.sql`"userId" NOT IN (${Prisma.join(hidden)})`);

  // Rank the candidate pool by FTS relevance where there is text to rank by,
  // and by engagement otherwise. The real ordering happens in JS below.
  const order = hasText
    ? Prisma.sql`GREATEST(
        ts_rank(content_tsv, websearch_to_tsquery('simple', ${terms.q})),
        COALESCE(word_similarity(${terms.q}, ${norm(Prisma.sql`"content"`)}), 0)
      ) DESC, "likeCount" DESC`
    : Prisma.sql`"createdAt" DESC`;

  const matches = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id
    FROM rmheet
    WHERE ${Prisma.join(filters, ' AND ')}
    ORDER BY ${order}, "createdAt" DESC
    LIMIT ${hasText ? CANDIDATE_POOL : limit}
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
      imageUrls: true,
      user: { select: userDisplaySelect },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const scored = ids
    .map((id) => byId.get(id))
    .filter((r): r is (typeof rows)[number] => Boolean(r))
    .map((row) => {
      const user = resolveUser(row.user);
      // Author name/handle are scored too so "posts by ada" style queries land
      // on the right author's posts, not just posts containing the word.
      const { score, reason } = hasText
        ? scoreRecord(terms.q, [
            { value: row.content, weight: 0.92 },
            { value: user.name, weight: 0.5 },
            { value: user.handle, weight: 0.5 },
          ])
        : { score: 0.5, reason: 'none' as const };
      const boosted = hasText
        ? withRecency(withPopularity(score, row.likeCount), row.createdAt)
        : score;
      return {
        post: {
          id: row.id,
          content: row.content,
          createdAt: row.createdAt.toISOString(),
          likeCount: row.likeCount,
          user,
          score: boosted,
          confidence: confidenceOf(boosted),
        },
        score: boosted,
        reason,
      };
    })
    .filter((r) => !hasText || r.score >= floor);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Resolve `in:<slug>` to a community id. Returns `undefined` when unknown. */
export async function resolveCommunityId(slug: string): Promise<string | undefined> {
  const row = await prisma.community.findFirst({
    where: { slug, isPrivate: false },
    select: { id: true },
  });
  return row?.id;
}

export function postToHit({ post, score, reason }: ScoredPost): SearchHit {
  const author = post.user;
  return {
    key: `post:${post.id}`,
    id: post.id,
    kind: 'post',
    title: author.name || author.handle || 'Post',
    subtitle: author.handle ? `@${author.handle}` : undefined,
    snippet: post.content,
    href: `/u/${author.handle ?? '_'}/post/${post.id}`,
    image: author.image,
    score,
    confidence: confidenceOf(score),
    reason,
    meta: { likeCount: post.likeCount, createdAt: post.createdAt },
  };
}
