/**
 * For-You ranking seam (Phase 5 of docs/feed/plan.md).
 *
 * A lightweight, dependency-free score: recency decay × engagement velocity,
 * nudged by author affinity. This is intentionally a *pure* function over data
 * the read path already has, so it can be slotted into `getTimeline()` without
 * new infrastructure. "Following" stays strict reverse-chron (users expect
 * that); only "For You" is scored.
 *
 * NOTE: ranking and keyset pagination pull in different directions — a fully
 * ranked timeline needs a score-based cursor. Until that lands, the timeline
 * keeps a chronological keyset boundary and applies ranking only to *reorder
 * the candidate window* within a page (see RANKING_ENABLED). This keeps
 * infinite scroll stable while giving the surface a "For You" character.
 */

import type { FeedItem } from "../feed-types";

/**
 * Master switch. Ranking reorders the candidate window *within* a page but
 * never moves the (chronological) page boundary, so infinite scroll stays
 * stable. Enabled to power the personalized "For You" surface (#11).
 */
export const RANKING_ENABLED = true;

/** Half-life (hours) for the recency decay term. */
const RECENCY_HALF_LIFE_HOURS = 6;

/** Extract lowercased #hashtags from post content (pure, cheap). */
export function extractTags(text: string): string[] {
  const out: string[] = [];
  const re = /#(\w{2,50})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1].toLowerCase());
  return out;
}

export interface RankContext {
  /** Author ids the viewer follows — affinity boost. */
  followingIds?: Set<string>;
  /**
   * Personalized author affinity: authorId → weight (0..1), derived from the
   * viewer's recent engagement. Boosts authors the viewer actually interacts
   * with, beyond the binary follow signal.
   */
  authorAffinity?: Map<string, number>;
  /** Personalized topic interest: hashtag → weight (0..1) from recent likes. */
  topicInterest?: Map<string, number>;
  /** "Now" for deterministic testing; defaults to Date.now(). */
  now?: number;
}

/**
 * Score a single candidate. Higher = more likely to surface. Pure and cheap.
 */
export function scoreCandidate(item: FeedItem, ctx: RankContext = {}): number {
  const now = ctx.now ?? Date.now();
  const ageHours = Math.max(
    0,
    (now - new Date(item.createdAt).getTime()) / 3_600_000
  );

  // Exponential recency decay (1 at t=0, 0.5 at one half-life, …).
  const recency = Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);

  // Engagement velocity: weighted engagement per hour of life. Likes and
  // reposts signal more than passive views.
  const engagement =
    (item.likeCount ?? 0) * 1 +
    (item.repostCount ?? 0) * 2 +
    (item.commentCount ?? 0) * 1.5 +
    (item.viewCount ?? 0) * 0.05;
  const velocity = engagement / (ageHours + 2); // +2 dampens brand-new posts

  // Author affinity: a gentle boost for people the viewer follows.
  const affinity =
    item.user?.id && ctx.followingIds?.has(item.user.id) ? 1.25 : 1;

  // Personalized boost from the viewer's recent engagement: authors they
  // interact with + topics (hashtags) they like. Capped so it tilts, not
  // dominates, the ranking — recency/engagement still lead.
  const personalAffinity = item.user?.id ? ctx.authorAffinity?.get(item.user.id) ?? 0 : 0;
  let topic = 0;
  if (ctx.topicInterest && ctx.topicInterest.size > 0 && item.content) {
    for (const tag of extractTags(item.content)) {
      topic += ctx.topicInterest.get(tag) ?? 0;
    }
  }
  const personalBoost = 1 + Math.min(1.5, personalAffinity * 0.6 + topic * 0.4);

  // Freshness pin: brand-new posts (last ~15 min) are guaranteed to sort above
  // ranked-but-older content, so just-posted content (e.g. a paid post you
  // just published) is always visible at the top after a refresh instead of
  // being buried — or cut from the first page — by engagement ranking.
  const FRESH_PIN = 1_000_000;
  const freshness = ageHours < 0.25 ? FRESH_PIN - ageHours : 0;

  return freshness + (recency * 3 + Math.log1p(velocity)) * affinity * personalBoost;
}

/**
 * Stable, score-descending reorder of a candidate window. Falls back to the
 * input order (assumed reverse-chron) for equal scores so behaviour is
 * deterministic and chronological when ranking is a no-op.
 */
export function rankCandidates<T extends FeedItem>(
  items: T[],
  ctx: RankContext = {}
): T[] {
  if (!RANKING_ENABLED) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreCandidate(item, ctx) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item);
}
