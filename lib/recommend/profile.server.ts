/**
 * Assembling a member's taste profile (M2). Server-only.
 *
 * Reads the two tables the site already fills and nobody outside the feed uses:
 * `Activity` (schema:7803 — what they did, to what, when) and `FeedSignal`
 * (schema:7214 — what they asked for more or less of). Neither was built for
 * this and both are exactly right for it.
 *
 * ## Why a recent window rather than all of it
 *
 * Taste moves. Someone who played one game every day in March and has not
 * opened it since should not have a rail built around it in September. Ninety
 * days is long enough to survive a holiday and short enough to notice when
 * somebody's interests change.
 *
 * ## Why verbs are weighted differently
 *
 * A VIEWED is a glance and a SAVED is a decision. Weighting them equally means
 * the profile is mostly a record of what scrolled past, which is a record of
 * what was ranked highly — and a recommender that trains on its own output
 * converges within a week.
 */

import { prisma } from '@/lib/prisma.server';
import { EMPTY_PROFILE, type TasteProfile } from '@/lib/recommend/score';

/** How far back the profile looks. */
export const PROFILE_WINDOW_DAYS = 90;

/**
 * What each verb says about intent.
 *
 * VIEWED is deliberately small. It is the only verb the member does not choose
 * — it is emitted by scrolling — so treating it as a preference is how a
 * recommender ends up recommending what it already recommended.
 */
export const VERB_WEIGHT: Record<string, number> = {
  VIEWED: 0.2,
  PLAYED: 1.5,
  SAVED: 3,
  COMPLETED: 3,
  RATED: 2.5,
  SHARED: 3,
};

/** Rows read per profile build. Bounded — this runs on a request path. */
const ACTIVITY_LIMIT = 500;

/**
 * Build the profile.
 *
 * Returns the empty profile for a signed-out viewer rather than throwing, so
 * every surface can call this unconditionally and a logged-out visitor gets
 * popularity-and-recency ordering with no branch at the call site.
 */
export async function buildTasteProfile(
  userId: string | null,
  opts: { now?: Date } = {},
): Promise<TasteProfile> {
  if (!userId) return EMPTY_PROFILE;

  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - PROFILE_WINDOW_DAYS * 86_400_000);

  const [activities, signals] = await Promise.all([
    prisma.activity.findMany({
      where: { userId, at: { gte: since } },
      orderBy: { at: 'desc' },
      take: ACTIVITY_LIMIT,
      select: { verb: true, kind: true, entityId: true, meta: true },
    }),
    prisma.feedSignal.findMany({
      where: { userId },
      select: { kind: true, targetId: true },
    }),
  ]);

  const affinities: Record<string, number> = {};
  const seen = new Set<string>();

  for (const a of activities) {
    seen.add(a.entityId);
    const weight = VERB_WEIGHT[a.verb] ?? 0.5;

    // The facet is whatever the activity says it is about. `meta.facet` is the
    // explicit form; `kind` is the fallback, which at worst says "this member
    // plays games" — true, and useless, but never wrong.
    const meta = (a.meta ?? {}) as { facet?: unknown; tags?: unknown };
    const facets: string[] = [];
    if (typeof meta.facet === 'string') facets.push(meta.facet);
    if (Array.isArray(meta.tags)) {
      for (const t of meta.tags) if (typeof t === 'string') facets.push(t);
    }
    if (facets.length === 0) facets.push(a.kind);

    for (const f of facets) affinities[f] = (affinities[f] ?? 0) + weight;
  }

  const muted = new Set<string>();
  for (const s of signals) {
    // `less_author` and `mute_tag` are both "do not show me this"; the target
    // is the facet either way. `follow_tag` is the opposite and adds affinity
    // at a weight that beats any amount of incidental viewing.
    if (s.kind === 'less_author' || s.kind === 'mute_tag') muted.add(s.targetId);
    else if (s.kind === 'follow_tag') affinities[s.targetId] = (affinities[s.targetId] ?? 0) + 10;
  }

  // An explicit mute always wins over an implicit affinity. Somebody can both
  // have watched a lot of something and have asked to stop seeing it, and the
  // asking is the more recent and more deliberate statement.
  for (const m of muted) delete affinities[m];

  return { affinities, muted, seen };
}
