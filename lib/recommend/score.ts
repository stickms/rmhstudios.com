/**
 * Recommendation scoring and diversification (M2) — pure, client-safe.
 *
 * ## What this replaces
 *
 * Four surfaces each decide their own ordering and share no signal:
 * `lib/explore.server.ts` ranks explore, `lib/social/follow-graph.server.ts`
 * suggests people, `lib/sidebar-data.ts` decides what the sidebar shows, and
 * the games and apps catalogs are ordered by hand. Meanwhile `FeedSignal`
 * collects exactly three kinds of feedback (`less_author`, `mute_tag`,
 * `follow_tag`) that only the feed consumes.
 *
 * Four places to improve, four places to explain, four places to get wrong.
 *
 * ## The shape
 *
 * Candidates come from several generators (recent, popular, followed,
 * semantically near — M1), each producing a ranked list. Those are fused by the
 * same RRF the search uses, then scored against the member's profile, then
 * DIVERSIFIED, which is the step that makes the difference between a rail and
 * a monoculture.
 *
 * Diversity is not a nicety here. A recommender scoring purely on affinity
 * converges: it shows you more of what you engaged with, you engage with it,
 * and within a week the rail is one topic. Capping any single facet is what
 * keeps a surface a window rather than a mirror.
 */

/** One thing that could be recommended. */
export interface Candidate {
  id: string;
  /** Grouping key for diversity — an author, a tag, a genre. */
  facet?: string;
  /** Unix ms. Drives the recency term. */
  createdAt?: number;
  /** Whatever the surface counts as engagement. */
  popularity?: number;
}

/** What is known about the member, assembled from Activity and FeedSignal. */
export interface TasteProfile {
  /** Facets they engage with, and how strongly. Values are unbounded. */
  affinities: Record<string, number>;
  /** Facets they asked not to see. Absolute — never softened by affinity. */
  muted: ReadonlySet<string>;
  /** Entity ids they have already seen or played. */
  seen: ReadonlySet<string>;
}

export const EMPTY_PROFILE: TasteProfile = {
  affinities: {},
  muted: new Set(),
  seen: new Set(),
};

/** Half-life of the recency term, in days. */
export const RECENCY_HALF_LIFE_DAYS = 14;

/**
 * Recency as a 0–1 multiplier with a two-week half-life.
 *
 * Exponential rather than a cliff: a cliff means a rail visibly reshuffles the
 * moment something crosses it, and there is no age at which a good result
 * should become worthless.
 */
export function recencyFactor(createdAt: number | undefined, now: number): number {
  if (!createdAt) return 0.5;
  const days = Math.max(0, (now - createdAt) / 86_400_000);
  return Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Popularity, compressed.
 *
 * `log1p` because the difference between 0 and 10 likes says far more than the
 * difference between 1,000 and 1,010, and a linear term lets one viral item
 * dominate every rail on the site.
 */
export function popularityFactor(popularity: number | undefined): number {
  return Math.log1p(Math.max(0, popularity ?? 0));
}

/**
 * Affinity for a candidate's facet, compressed the same way.
 *
 * Also `log1p`: somebody who has played one game forty times should not have a
 * rail that is only that game.
 */
export function affinityFactor(facet: string | undefined, profile: TasteProfile): number {
  if (!facet) return 0;
  return Math.log1p(Math.max(0, profile.affinities[facet] ?? 0));
}

/** Relative weight of each term. Exposed so a surface can retune one rail. */
export interface Weights {
  base: number;
  affinity: number;
  popularity: number;
  recency: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  base: 1,
  affinity: 1.4,
  popularity: 0.6,
  recency: 0.8,
};

export interface ScoredCandidate extends Candidate {
  score: number;
  /** The terms, so "why am I seeing this" (M4) can be answered from the data. */
  terms: { base: number; affinity: number; popularity: number; recency: number };
}

/**
 * Score candidates and drop the ones the member has excluded.
 *
 * `baseRank` is the candidate's position in the fused list, so a generator's
 * own ordering still counts for something — a semantically perfect match that
 * nobody has engaged with should not be buried under a popular near-miss.
 *
 * Muted facets and already-seen ids are removed rather than down-weighted. A
 * mute that only lowers a score is a mute that shows the thing anyway on a
 * quiet day, which reads as the control not working.
 */
export function scoreCandidates(
  candidates: readonly Candidate[],
  profile: TasteProfile,
  opts: { now?: number; weights?: Weights } = {},
): ScoredCandidate[] {
  const now = opts.now ?? Date.now();
  const w = opts.weights ?? DEFAULT_WEIGHTS;

  return candidates
    .filter((c) => !profile.seen.has(c.id) && !(c.facet && profile.muted.has(c.facet)))
    .map((c, i) => {
      const base = w.base / Math.log2(i + 2);
      const affinity = w.affinity * affinityFactor(c.facet, profile);
      const popularity = w.popularity * popularityFactor(c.popularity);
      const recency = w.recency * recencyFactor(c.createdAt, now);
      return {
        ...c,
        score: base + affinity + popularity + recency,
        terms: { base, affinity, popularity, recency },
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Take `limit` results, allowing at most `maxPerFacet` from any one facet.
 *
 * The anti-monoculture step. Runs AFTER scoring, greedily down the sorted list,
 * so the best item from each facet is kept and the surplus is dropped rather
 * than reordered — which keeps the top of the rail exactly as scored.
 *
 * If the cap leaves the rail short (a member with one interest, which is a
 * perfectly normal thing to be), the shortfall is refilled from what the cap
 * excluded. A half-empty rail is worse than a repetitive one.
 */
export function diversify<T extends { id: string; facet?: string }>(
  scored: readonly T[],
  limit: number,
  maxPerFacet = 2,
): T[] {
  const out: T[] = [];
  const counts = new Map<string, number>();
  const overflow: T[] = [];

  for (const item of scored) {
    if (out.length >= limit) break;
    const facet = item.facet;
    if (!facet) {
      out.push(item);
      continue;
    }
    const n = counts.get(facet) ?? 0;
    if (n >= maxPerFacet) {
      overflow.push(item);
      continue;
    }
    counts.set(facet, n + 1);
    out.push(item);
  }

  for (const item of overflow) {
    if (out.length >= limit) break;
    out.push(item);
  }
  return out;
}

/**
 * A short, honest reason a candidate was surfaced (M4).
 *
 * Derived from whichever term dominated, so it cannot drift from the ranking
 * the way a hand-written label would. Returns a key, not a sentence — the
 * caller runs it through `t()`.
 */
export type RecommendationReason =
  | 'because-you-like'
  | 'popular-now'
  | 'just-posted'
  | 'matches-your-search'
  | 'new-to-you';

export function reasonFor(c: ScoredCandidate): RecommendationReason {
  const { affinity, popularity, recency, base } = c.terms;
  const top = Math.max(affinity, popularity, recency, base);
  if (top === 0) return 'new-to-you';
  if (top === affinity) return 'because-you-like';
  if (top === popularity) return 'popular-now';
  if (top === recency) return 'just-posted';
  return 'matches-your-search';
}
