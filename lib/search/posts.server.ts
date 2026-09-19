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
import { fuse, pinExact } from './hybrid';
import { isEmbeddingAvailable, nearest } from './embeddings.server';
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
  // ── Hybrid retrieval (M1) ────────────────────────────────────────────────
  //
  // The semantic half runs only when an embedding endpoint is configured, and
  // contributes an empty list when it is not. That is not a guard bolted on: it
  // is what makes this safe to ship before a key exists, because fusing one
  // list returns that list's own order and the behaviour below is then
  // byte-identical to what this function did before.
  //
  // Lexical carries more weight than semantic. Semantic is better at "the post
  // about the thing with the spheres" and worse at a name; the failure people
  // actually notice is an exact match that stopped coming first, so the tie is
  // broken toward the retriever that does not make that mistake.
  const semantic = hasText && isEmbeddingAvailable()
    ? await nearest('rmhark', terms.q, CANDIDATE_POOL).catch(() => [])
    : [];

  const semanticIds = new Set(semantic.map((n) => n.entityId));
  const fused = fuse({
    lex: { ids: matches.map((m) => m.id), weight: 1.3 },
    vec: { ids: semantic.map((n) => n.entityId) },
  });

  if (fused.length === 0) return [];

  const ids = fused.slice(0, CANDIDATE_POOL).map((h) => h.id);
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
      // A post the vector retriever found may share no characters with the
      // query at all, so its lexical score is 0 and the floor below would drop
      // it. Give it a floor-passing score instead — but only a floor-passing
      // one, so it ranks beneath everything that matched on words. Semantic
      // recall is worth having underneath the lexical results; it is not worth
      // having above them.
      const semanticFloor = semanticIds.has(row.id) ? MATCH_FLOOR : 0;
      const effective = Math.max(score, semanticFloor);
      const boosted = hasText
        ? withRecency(withPopularity(effective, row.likeCount), row.createdAt)
        : effective;
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
        reason: score > 0 ? reason : semanticIds.has(row.id) ? ('semantic' as const) : reason,
      };
    })
    .filter((r) => !hasText || r.score >= floor);

  scored.sort((a, b) => b.score - a.score);

  // An exact match is pinned regardless of anything above. Somebody typing a
  // title in full is asking for that thing, not expressing an interest in the
  // topic, and no amount of semantic neighbourhood should outrank it.
  const exactIds = scored.filter((s) => s.reason === 'exact').map((s) => s.post.id);
  if (exactIds.length > 0) {
    const order = new Map(
      pinExact(
        scored.map((s) => ({ id: s.post.id, score: s.score, ranks: {} })),
        exactIds,
      ).map((h, i) => [h.id, i]),
    );
    scored.sort((a, b) => (order.get(a.post.id) ?? 0) - (order.get(b.post.id) ?? 0));
  }

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
