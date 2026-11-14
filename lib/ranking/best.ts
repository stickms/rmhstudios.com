/**
 * The order of a list of creations (generated pages, user builds, AI personas).
 *
 * Every Create list is ordered here, by one of three sorts, so two lists never disagree about what
 * "Best" means and no list is ever returned in insertion or random order:
 *
 * - `best` (the default): engagement weighed against age, so a list opens on what people are using
 *   now rather than on whatever was made last or whatever was popular once.
 * - `popular`: engagement alone, all time.
 * - `newest`: creation time alone.
 *
 * All three end on the same tiebreak, newer first and then `id` descending, which makes the order
 * total: the same rows and the same `now` always give the same list, whatever order the database
 * returned them in.
 *
 * Pure and client-safe. The server half that pages through a ranked list is `rank-page.ts`.
 */

export const CREATION_SORTS =
  [
    'best',
    'popular',
    'newest',
  ] as const;
export type CreationSort =
  (typeof CREATION_SORTS)[number];
export const DEFAULT_CREATION_SORT: CreationSort =
  'best';

export function parseCreationSort(
  value: unknown,
): CreationSort {
  return CREATION_SORTS.includes(
    value as CreationSort,
  )
    ? (value as CreationSort)
    : DEFAULT_CREATION_SORT;
}

/** The three signals a row is ranked on. `engagement` is already weighted (see the `*Engagement` helpers). */
export interface Rankable {
  id: string;
  engagement: number;
  /** Creation or publication time, epoch milliseconds. */
  createdAt: number;
}

const DAY_MS = 86_400_000;

/**
 * Days after which a creation's score is half what the same engagement earns on day zero. A fortnight,
 * not the feed's six hours (`lib/feed/ranking.ts`): a post is read for an afternoon, a page or a build
 * is found and used for weeks, and these lists gain a handful of rows a day.
 */
export const BEST_HALF_AGE_DAYS = 14;

/**
 * `(1 + engagement) / (1 + ageDays / 14)`.
 *
 * The `1 +` in the numerator gives a creation with no engagement a non-zero score that still falls with
 * age, so untouched rows sort newest first instead of all tying at zero. The `1 +` in the denominator
 * means age zero divides by one, never by zero. A negative count or a creation time in the future (clock
 * skew) is clamped to zero, so the score is always finite and positive. The decay is hyperbolic rather
 * than exponential on purpose: something with real use sinks slowly and is not erased by a new empty row.
 */
export function bestScore(
  engagement: number,
  ageMs: number,
): number {
  const e =
    Number.isFinite(
      engagement,
    )
      ? Math.max(
          0,
          engagement,
        )
      : 0;
  const ageDays =
    Number.isFinite(
      ageMs,
    )
      ? Math.max(
          0,
          ageMs,
        ) /
        DAY_MS
      : 0;
  return (
    (1 +
      e) /
    (1 +
      ageDays /
        BEST_HALF_AGE_DAYS)
  );
}

/** Newer first, then `id` descending. The last word of every sort. */
function tiebreak(
  a: Rankable,
  b: Rankable,
): number {
  if (
    a.createdAt !==
    b.createdAt
  )
    return (
      b.createdAt -
      a.createdAt
    );
  return a.id <
    b.id
    ? 1
    : a.id >
        b.id
      ? -1
      : 0;
}

/** A comparator for `Array.prototype.sort`: the first row of the list sorts first. */
export function compareCreations(
  sort: CreationSort,
  now: number,
): (
  a: Rankable,
  b: Rankable,
) => number {
  if (
    sort ===
    'newest'
  )
    return tiebreak;
  if (
    sort ===
    'popular'
  )
    return (
      a,
      b,
    ) =>
      b.engagement -
        a.engagement ||
      tiebreak(
        a,
        b,
      );
  return (
    a,
    b,
  ) =>
    bestScore(
      b.engagement,
      now -
        b.createdAt,
    ) -
      bestScore(
        a.engagement,
        now -
          a.createdAt,
      ) ||
    tiebreak(
      a,
      b,
    );
}

/** A new array in list order; the input is not mutated. */
export function rankCreations<
  T extends
    Rankable,
>(
  rows: readonly T[],
  sort: CreationSort,
  now: number,
): T[] {
  return [
    ...rows,
  ].sort(
    compareCreations(
      sort,
      now,
    ),
  );
}

// ── Engagement per kind ───────────────────────────────────────────────────────
// The weights are the feed's (`scoreCandidate` in lib/feed/ranking.ts): a like is 1, a comment 1.5,
// a passive view 0.05. Each kind uses the signals its table actually has.

/** A user build: likes, comments and views. */
export function buildEngagement(b: {
  likeCount: number;
  commentCount: number;
  viewCount: number;
}): number {
  return (
    b.likeCount +
    b.commentCount *
      1.5 +
    b.viewCount *
      0.05
  );
}

/** An AI persona has one signal: how many chats it has had. */
export function personaEngagement(p: {
  chatCount: number;
}): number {
  return p.chatCount;
}

/**
 * A generated page has no likes or view counter. What it has is its version history: every version
 * after the first is someone coming back to customise the page, the only use the data records.
 */
export function pageEngagement(p: {
  versionCount: number;
}): number {
  return Math.max(
    0,
    p.versionCount -
      1,
  );
}
