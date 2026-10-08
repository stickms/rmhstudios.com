/**
 * The one recommender (M2). Server-only.
 *
 * Every surface calls {@link recommend} with a slot type and gets back a ranked,
 * diversified list with a reason attached to each item. One place to improve,
 * one place to explain (M4), one place to test.
 *
 * Candidate generation is per-slot because the corpora have nothing in common;
 * scoring, diversification and reasons are shared because those are the parts
 * that were being reinvented.
 */

import { prisma } from '@/lib/prisma.server';
import { fuse } from '@/lib/search/hybrid';
import { isEmbeddingAvailable, similarTo } from '@/lib/search/embeddings.server';
import { buildTasteProfile } from '@/lib/recommend/profile.server';
import {
  diversify,
  reasonFor,
  scoreCandidates,
  type Candidate,
  type RecommendationReason,
  type TasteProfile,
} from '@/lib/recommend/score';

/** Which rail is being filled. */
export type Slot = 'games' | 'apps' | 'posts' | 'library' | 'builds';

export interface Recommendation {
  id: string;
  /**
   * An i18n key, not a sentence, and derived from whichever scoring term
   * carried the item — so the label cannot drift from the ranking the way a
   * hand-written one would (M4).
   */
  reason: RecommendationReason;
  /** The facet that earned it, when affinity is why it is here. */
  because?: string;
}

export interface RecommendOptions {
  limit?: number;
  /** Anchor for "more like this" — uses the stored vector, no model call. */
  similarToId?: string;
  maxPerFacet?: number;
  now?: Date;
}

/**
 * Fill a rail.
 *
 * Always returns something: with no profile, no embeddings and no history, the
 * scoring degrades to popularity and recency, which is a perfectly reasonable
 * rail and is what a signed-out visitor sees.
 */
export async function recommend(
  slot: Slot,
  userId: string | null,
  opts: RecommendOptions = {},
): Promise<Recommendation[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 12), 60);
  const profile = await buildTasteProfile(userId, { now: opts.now });
  const candidates = await generate(slot, profile, opts);

  const scored = scoreCandidates(candidates, profile, { now: opts.now?.getTime() });
  return diversify(scored, limit, opts.maxPerFacet ?? 2).map((c) => ({
    id: c.id,
    reason: reasonFor(c),
    ...(c.facet && profile.affinities[c.facet] ? { because: c.facet } : {}),
  }));
}

/* -------------------------------------------------------------------------- */
/* Candidate generation                                                       */
/* -------------------------------------------------------------------------- */

/** Pool size per generator. Generous — diversity needs something to choose from. */
const POOL = 120;

async function generate(
  slot: Slot,
  profile: TasteProfile,
  opts: RecommendOptions,
): Promise<Candidate[]> {
  switch (slot) {
    case 'games':
    case 'apps':
      return catalogCandidates(slot, opts);
    case 'posts':
      return postCandidates(opts);
    case 'library':
      return libraryCandidates(opts);
    case 'builds':
      return buildCandidates(opts);
  }
  void profile;
}

/**
 * Games and apps.
 *
 * The catalogs are static, so "popular" comes from `Activity` rather than a
 * column: counting PLAYED in the window is both the honest measure and one the
 * catalog files do not have to carry.
 */
async function catalogCandidates(slot: 'games' | 'apps', opts: RecommendOptions): Promise<Candidate[]> {
  const { games } = await import('@/lib/games');
  const { apps } = await import('@/lib/apps');
  const entries = slot === 'games' ? games : apps;

  const plays = await prisma.activity.groupBy({
    by: ['entityId'],
    where: { kind: slot === 'games' ? 'game' : 'app', verb: 'PLAYED' },
    _count: { entityId: true },
  });
  const playCount = new Map(plays.map((p) => [p.entityId, p._count.entityId]));

  const base: Candidate[] = entries.map((e) => ({
    id: e.id,
    // Genre is the diversity facet for games — without it, a member who likes
    // puzzles gets a rail of nothing but puzzles, which is the monoculture the
    // cap exists to prevent.
    facet: 'tags' in e && Array.isArray(e.tags) ? String(e.tags[0] ?? slot) : slot,
    popularity: playCount.get(e.id) ?? 0,
  }));

  return withSimilarity(slot === 'games' ? 'game' : 'app', base, opts);
}

async function postCandidates(opts: RecommendOptions): Promise<Candidate[]> {
  const rows = await prisma.rMHark.findMany({
    where: { deletedAt: null, audience: 'PUBLIC', unlockPrice: null },
    orderBy: { createdAt: 'desc' },
    take: POOL,
    select: { id: true, userId: true, likeCount: true, createdAt: true },
  });
  const base: Candidate[] = rows.map((r) => ({
    id: r.id,
    facet: r.userId,
    popularity: r.likeCount,
    createdAt: r.createdAt.getTime(),
  }));
  return withSimilarity('rmhark', base, opts);
}

async function libraryCandidates(opts: RecommendOptions): Promise<Candidate[]> {
  const rows = await prisma.libraryDocument.findMany({
    orderBy: { createdAt: 'desc' },
    take: POOL,
    select: { id: true, createdAt: true },
  });
  const base: Candidate[] = rows.map((r) => ({ id: r.id, createdAt: r.createdAt.getTime() }));
  return withSimilarity('library', base, opts);
}

async function buildCandidates(opts: RecommendOptions): Promise<Candidate[]> {
  const rows = await prisma.userBuild.findMany({
    orderBy: { createdAt: 'desc' },
    take: POOL,
    select: { id: true, userId: true, createdAt: true },
  });
  const base: Candidate[] = rows.map((r) => ({
    id: r.id,
    facet: r.userId,
    createdAt: r.createdAt.getTime(),
  }));
  return withSimilarity('build', base, opts);
}

/**
 * Fold a semantic neighbour list into a candidate pool, when there is one.
 *
 * Fused by the same RRF the search uses, so "near in meaning" and "recent and
 * popular" are combined by ORDER rather than by a weighting of incomparable
 * numbers — see `lib/search/hybrid.ts` for why that matters.
 *
 * Silent no-op when embeddings are unavailable or no anchor was given, which
 * keeps every caller free of a branch.
 */
async function withSimilarity(
  kind: Parameters<typeof similarTo>[0],
  base: Candidate[],
  opts: RecommendOptions,
): Promise<Candidate[]> {
  if (!opts.similarToId || !isEmbeddingAvailable()) return base;

  const neighbours = await similarTo(kind, opts.similarToId, POOL).catch(() => []);
  if (neighbours.length === 0) return base;

  const byId = new Map(base.map((c) => [c.id, c]));
  const order = fuse({
    recent: { ids: base.map((c) => c.id) },
    similar: { ids: neighbours.map((n) => n.entityId), weight: 1.2 },
  });

  return order
    .map((h) => byId.get(h.id) ?? { id: h.id })
    // The anchor itself is never a recommendation of itself.
    .filter((c) => c.id !== opts.similarToId);
}
