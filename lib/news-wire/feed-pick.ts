/**
 * The RMH News feed pick, the pure half: whether a pick is due, and which headline it is.
 *
 * The feed is people's posts first. RMH News puts at most {@link FeedPickPolicy.perDay} stories a day into it (as a
 * repost by the RMH News account of the story's discussion post), never two within {@link FeedPickPolicy.minGapHours}
 * of each other, and never the same story twice. Readers who want none can mute the account or turn its reposts off,
 * like any account's.
 *
 * The story is the one readers are already engaging with: comments, reposts and likes on its discussion, and whether
 * anyone opened it (a cached summary means someone did), then freshness. A topic or an outlet the last picks used
 * scores lower, so a day of picks is not four football stories.
 */

export interface FeedPickPolicy {
  perDay: number;
  minGapHours: number;
  /** Only headlines published this recently are candidates. */
  maxAgeHours: number;
}

export const DEFAULT_FEED_PICK_POLICY: FeedPickPolicy = { perDay: 4, minGapHours: 3, maxAgeHours: 12 };

/** `NEWS_FEED_PICKS_PER_DAY` (0 turns the picks off) over the default policy. */
export function feedPickPolicy(env: Record<string, string | undefined> = process.env): FeedPickPolicy {
  const raw = Number(env.NEWS_FEED_PICKS_PER_DAY);
  const perDay = Number.isFinite(raw) && raw >= 0 ? Math.min(Math.floor(raw), 12) : DEFAULT_FEED_PICK_POLICY.perDay;
  return { ...DEFAULT_FEED_PICK_POLICY, perDay };
}

/** Whether a pick may run now, given when the recent picks were made (any order). */
export function pickIsDue(policy: FeedPickPolicy, recentPicks: readonly Date[], now: Date): boolean {
  if (policy.perDay <= 0) return false;
  const dayAgo = now.getTime() - 86_400_000;
  const inDay = recentPicks.filter((d) => d.getTime() > dayAgo);
  if (inDay.length >= policy.perDay) return false;
  const latest = Math.max(0, ...recentPicks.map((d) => d.getTime()));
  return now.getTime() - latest >= policy.minGapHours * 3_600_000;
}

export interface PickCandidate {
  id: string;
  category: string;
  publisher: string;
  publishedAt: Date;
  hasImage: boolean;
  /** Someone opened it (its summary is cached). */
  opened: boolean;
  comments: number;
  reposts: number;
  likes: number;
}

export interface RecentPick {
  category: string;
  publisher: string;
}

export function scoreCandidate(
  c: PickCandidate,
  recent: readonly RecentPick[],
  policy: FeedPickPolicy,
  now: Date,
): number {
  const ageHours = Math.max(0, (now.getTime() - c.publishedAt.getTime()) / 3_600_000);
  const engagement = c.comments * 3 + c.reposts * 4 + c.likes;
  let score = Math.log2(1 + engagement) * 3 + (c.opened ? 2 : 0);
  score += Math.max(0, policy.maxAgeHours - ageHours) / 4;
  if (c.hasImage) score += 1;
  if (recent.some((r) => r.category === c.category)) score -= 3;
  if (recent.some((r) => r.publisher === c.publisher)) score -= 1;
  return score;
}

/** The headline to feature, or null when there is none worth it. Ties go to the newer one, then the id. */
export function choosePick(
  candidates: readonly PickCandidate[],
  recent: readonly RecentPick[],
  policy: FeedPickPolicy,
  now: Date,
): PickCandidate | null {
  const maxAge = policy.maxAgeHours * 3_600_000;
  let best: { c: PickCandidate; score: number } | null = null;
  for (const c of candidates) {
    if (now.getTime() - c.publishedAt.getTime() > maxAge) continue;
    const score = scoreCandidate(c, recent, policy, now);
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (c.publishedAt > best.c.publishedAt ||
          (c.publishedAt.getTime() === best.c.publishedAt.getTime() && c.id < best.c.id)))
    ) {
      best = { c, score };
    }
  }
  return best?.c ?? null;
}
