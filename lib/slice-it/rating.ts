/**
 * Slice It — the computed difficulty rating (`C3`).
 *
 * ## Why a number
 *
 * Difficulty is one of four names. Two `expert` charts can be an order of
 * magnitude apart — an `expert` on a 70 BPM ballad and an `expert` on a 200 BPM
 * stream are the same word — and the library's sorts (`recent`/`popular`/
 * `liked`/`title`/`duration`) offer no way to find something at your level. The
 * rating is one `Float` on `Chart.rating` that turns "what can I actually play"
 * into a sortable column.
 *
 * ## THE WEIGHTS ARE A STARTING POINT, NOT A DERIVED TRUTH
 *
 * Read this before quoting a number out of this file at anybody.
 *
 * Every constant below — the five weights, the two scalars that put jack
 * density and burst length on the same axis as notes-per-second, the
 * compression exponent, the 20-point ceiling — was chosen by judgement about
 * what makes a chart hard, and nothing more. None of it is fitted. There is no
 * clear-rate data in this repository to fit it against, and until `R9` exists
 * there is no way to produce any.
 *
 * Every mature rating system in the genre (osu! star rating, Etterna MSD,
 * Quaver, IIDX levels) was tuned against real play data over years, and every
 * one of them was visibly wrong on its first pass — usually in the same
 * direction, over-rating dense-but-easy patterns and under-rating technical
 * ones. Expect this to be wrong the same way.
 *
 * The calibration procedure, when the data exists, is in
 * `docs/_handoff/rating-requests.md` §1. Until then treat a rating as a rough
 * ordering within a library, not as a claim that a 12.4 is 1.1× a 11.3.
 *
 * ## Browser-safe — deliberately
 *
 * No Node imports, no `prisma`, no `fs`. The chart editor rates live as you
 * type: every keystroke that moves a note re-runs {@link rateChart} on the
 * client, and the server runs the identical function on save so that the number
 * shown in the editor and the number stored on the row are the same number.
 * Keep it that way — anything that needs a database belongs in
 * `rating.server.ts`.
 */

import type { SliceType } from './constants';
import type { Slice } from './types';

/**
 * Note types that a player must actually hit, and which therefore count toward
 * density.
 *
 * `SPEED` is a scroll-velocity marker and `BOMB` is a note you must NOT hit; a
 * chart that is 80% bombs is not thereby harder in the way NPS means, and
 * counting them would make a bomb-spam chart read as a stream chart. Bombs do
 * make a chart harder — that is priced by the modifier bonus in `scoring.ts`,
 * not here.
 *
 * Enumerated positively — the types that DO count — rather than as
 * `SLICE_TYPES` minus an exclusion list. The difference matters when a new type
 * is added: an exclusion list silently opts it in and changes every rating in
 * the library, while this fails to count it until somebody decides it should be
 * counted. Typed against `SliceType`, so a type that is renamed or removed is a
 * compile error here rather than a set entry that quietly matches nothing.
 */
const RATED_TYPES: ReadonlySet<SliceType> = new Set<SliceType>([
  'STANDARD',
  'MOVING',
  'LONG',
  'SILENT',
  'SWITCH',
]);

/**
 * Same-lane gap under which two consecutive notes read as a jack rather than as
 * two separate taps, in seconds.
 *
 * 0.2s is 300 BPM eighths — above that speed a repeated lane stops being "hit
 * it again" and becomes a distinct motor skill.
 */
const JACK_WINDOW_SEC = 0.2;

/** Gap under which consecutive notes count as part of one burst, in seconds. */
const BURST_GAP_SEC = 0.12;

/** The window, in seconds, over which "peak" density is measured. */
const PEAK_WINDOW_SEC = 1;

/** The window over which "sustained" density is measured. */
const SUSTAINED_WINDOW_SEC = 8;

/**
 * Which percentile of the sustained windows counts as "the sustained rate".
 *
 * Not the max: one 8-second window containing the single hardest section is a
 * peak measurement with a longer window, and `peakNps` already covers that.
 * Not the mean: a chart is remembered for its hard half, and the quiet intro
 * would halve it. The 90th percentile is "the rate this chart asks you to hold
 * for a while".
 */
const SUSTAINED_PERCENTILE = 0.9;

/**
 * The weights. See the file header before changing any of these.
 *
 * They sum to 1 so that `raw` stays on roughly the same scale as NPS, which
 * makes the compression exponent below interpretable. That is a convenience,
 * not a constraint — nothing enforces it.
 */
export const RATING_WEIGHTS = {
  /** The hardest single second. What a chart's spike costs you. */
  peakNps: 0.35,
  /** The hardest sustained stretch. What a chart's stamina costs you. */
  sustainedNps: 0.25,
  /** Same-lane repeats — the pattern most under-weighted by raw NPS. */
  jacks: 0.2,
  /** Longest unbroken run of dense notes. */
  bursts: 0.1,
  /** Share of notes that are holds. */
  holds: 0.1,
} as const;

/**
 * Scalars that put the three *ratio* features (0–1 each) onto the same axis as
 * the two NPS features (roughly 0–20 notes per second).
 *
 * A chart that is 100% jacks is about as hard as a 20 NPS chart; a chart that
 * is 100% holds is not. These three numbers are the crudest part of the model
 * and the first thing calibration should replace.
 */
const RATIO_SCALE = { jacks: 20, bursts: 8, holds: 6 } as const;

/** Burst length, in notes, that counts as a "full" burst score of 1. */
const BURST_FULL_LENGTH = 16;

/** The top of the scale. Ratings are clamped here. */
export const MAX_RATING = 20;

/**
 * Compression: `MAX_RATING`-bounded, `raw^COMPRESSION_EXPONENT * COMPRESSION_SCALE`.
 *
 * Linear NPS reads as "13 is twice as hard as 6.5", which is not how difficulty
 * is experienced at the top of the range — the gap between 18 and 19 is far
 * larger than the gap between 4 and 5, in both practice time and clear rate.
 * Sub-linear compression is what every rating scale in the genre does, for
 * exactly this reason.
 */
const COMPRESSION_EXPONENT = 0.78;
const COMPRESSION_SCALE = 2.2;

/**
 * The version of this algorithm, stored beside a rating on `Chart.ratingVersion`.
 *
 * Without it, a library holding ratings from three different versions of these
 * weights is a library that cannot be sorted meaningfully, and there is no way
 * to find the stale rows to re-rate. **Bump it on any change to a weight, a
 * scalar or the compression** — a bug fix in a helper that changes no output
 * does not need one, but when in doubt bump it: the cost is a re-rate pass and
 * the cost of not doing it is silently mixed scales.
 */
export const RATING_VERSION = 1;

/** The per-feature breakdown, for the editor's "why is this rated 14?" panel. */
export interface RatingBreakdown {
  /** Notes in the hardest {@link PEAK_WINDOW_SEC}-second window, per second. */
  peakNps: number;
  /** The {@link SUSTAINED_PERCENTILE} of the {@link SUSTAINED_WINDOW_SEC}-windows. */
  sustainedNps: number;
  /** Share of notes that are a same-lane repeat within {@link JACK_WINDOW_SEC}. */
  jackDensity: number;
  /** Longest unbroken burst, as a share of {@link BURST_FULL_LENGTH}. */
  burstScore: number;
  /** Share of rated notes that are holds. */
  holdShare: number;
  /** How many notes were rated (excludes `SPEED`/`BOMB`). */
  ratedNotes: number;
  /** The pre-compression weighted sum, for debugging the weights. */
  raw: number;
  /** The final 0–{@link MAX_RATING} value — the same number {@link rateChart} returns. */
  rating: number;
}

/**
 * The rating of a chart, 0–{@link MAX_RATING}, to one decimal place.
 *
 * `duration` is accepted for callers that know the track length; it is only
 * used as a floor on the measured span, so a chart whose notes all sit in the
 * first 30 seconds of a 5-minute track is not read as a 30-second chart. Pass 0
 * or omit it to measure the note span alone.
 *
 * An empty or all-unrated note list rates 0 rather than throwing: an empty
 * chart in the editor is a normal state, not an error, and the editor calls
 * this on every keystroke.
 */
export function rateChart(notes: readonly Slice[], duration = 0): number {
  return rateChartDetailed(notes, duration).rating;
}

/** {@link rateChart} with the per-feature numbers kept. */
export function rateChartDetailed(notes: readonly Slice[], duration = 0): RatingBreakdown {
  const rated = notes
    .filter((n) => RATED_TYPES.has(n.type) && Number.isFinite(n.time))
    .sort((a, b) => a.time - b.time);

  const empty: RatingBreakdown = {
    peakNps: 0,
    sustainedNps: 0,
    jackDensity: 0,
    burstScore: 0,
    holdShare: 0,
    ratedNotes: rated.length,
    raw: 0,
    rating: 0,
  };
  if (rated.length === 0) return empty;

  const times = rated.map((n) => n.time);
  const span = Math.max(times[times.length - 1] - times[0], duration, 0);

  const peakNps = maxOverWindow(times, PEAK_WINDOW_SEC) / PEAK_WINDOW_SEC;
  const sustainedNps =
    percentileOverWindow(times, SUSTAINED_WINDOW_SEC, SUSTAINED_PERCENTILE, span) /
    SUSTAINED_WINDOW_SEC;
  const jackDensity = countJacks(rated) / rated.length;
  const burstScore = Math.min(1, longestRun(times, BURST_GAP_SEC) / BURST_FULL_LENGTH);
  const holdShare = rated.filter((n) => n.type === 'LONG').length / rated.length;

  const raw =
    RATING_WEIGHTS.peakNps * peakNps +
    RATING_WEIGHTS.sustainedNps * sustainedNps +
    RATING_WEIGHTS.jacks * jackDensity * RATIO_SCALE.jacks +
    RATING_WEIGHTS.bursts * burstScore * RATIO_SCALE.bursts +
    RATING_WEIGHTS.holds * holdShare * RATIO_SCALE.holds;

  const compressed = COMPRESSION_SCALE * Math.pow(Math.max(0, raw), COMPRESSION_EXPONENT);
  const rating = round1(Math.min(MAX_RATING, compressed));

  return {
    peakNps,
    sustainedNps,
    jackDensity,
    burstScore,
    holdShare,
    ratedNotes: rated.length,
    raw,
    rating,
  };
}

/**
 * The most notes falling inside any `window`-second span.
 *
 * A two-pointer sweep over the sorted times: O(n), because the editor runs this
 * on every keystroke on charts that reach several thousand notes, and the
 * obvious O(n²) "for each note, count forward" is measurably janky at that size.
 *
 * The window is half-open `[t, t + window)` so a note exactly one second after
 * another does not count in the same one-second window twice.
 */
function maxOverWindow(times: readonly number[], window: number): number {
  let best = 0;
  let start = 0;
  for (let end = 0; end < times.length; end++) {
    while (times[end] - times[start] >= window) start++;
    best = Math.max(best, end - start + 1);
  }
  return best;
}

/**
 * The `p`-th percentile of note counts across sliding `window`-second spans.
 *
 * Windows are sampled at every note onset rather than on a fixed grid: a grid
 * fine enough not to miss a spike is more samples than the notes themselves,
 * and a coarse grid's answer depends on where the chart happens to start.
 *
 * `span` is the chart length; a chart shorter than one window is measured over
 * its whole self, so a 4-second chart is not reported as having 8 seconds of
 * silence in it.
 */
function percentileOverWindow(
  times: readonly number[],
  window: number,
  p: number,
  span: number,
): number {
  if (span <= window) return times.length * (window / Math.max(window, span || window));

  const counts: number[] = [];
  let end = 0;
  for (let start = 0; start < times.length; start++) {
    // Only sample windows that fit inside the chart; a window hanging off the
    // end is a shorter window, and would drag the percentile down with silence
    // that is not in the chart.
    if (times[start] + window > times[times.length - 1]) break;
    while (end < times.length && times[end] < times[start] + window) end++;
    counts.push(end - start);
  }
  if (counts.length === 0) return times.length;

  counts.sort((a, b) => a - b);
  const idx = Math.min(counts.length - 1, Math.max(0, Math.round(p * (counts.length - 1))));
  return counts[idx];
}

/**
 * Same-lane consecutive notes — the pattern most under-weighted by raw NPS.
 *
 * Alternating lanes at 10 NPS is a comfortable trill; the same 10 NPS on one
 * lane is a wrist-destroying jack that a large share of players simply cannot
 * do at all. NPS cannot see the difference, so it is counted separately.
 */
function countJacks(notes: readonly Slice[]): number {
  let n = 0;
  for (let i = 1; i < notes.length; i++) {
    if (
      notes[i].lane === notes[i - 1].lane &&
      notes[i].time - notes[i - 1].time < JACK_WINDOW_SEC
    ) {
      n++;
    }
  }
  return n;
}

/** The longest chain of notes each within `gap` seconds of the previous one. */
function longestRun(times: readonly number[], gap: number): number {
  let best = times.length > 0 ? 1 : 0;
  let run = best;
  for (let i = 1; i < times.length; i++) {
    run = times[i] - times[i - 1] <= gap ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* ══ R2 — the skill weighting ═════════════════════════════════════════════ */

/**
 * The weighting that turns a set of per-chart bests into one skill number.
 *
 * It lives here, beside the chart rating, for two reasons. It is pure
 * arithmetic over numbers — no database, no session, nothing server-shaped — so
 * it can be tested without a Postgres, which the repository does not have. And
 * a results screen wanting to say "this run is worth 47 rating" needs it on the
 * client. The database half (which rows count, and writing the answer back) is
 * `rating.server.ts`.
 *
 * The same disclaimer as the file header applies to every constant below.
 */

/**
 * Geometric decay applied down the sorted list of per-chart contributions.
 *
 * This is what makes the number a skill measure rather than a play counter: a
 * player's 200th-best chart contributes `0.95^199 ≈ 0.004` of its value, so a
 * hundred more easy clears move the total by less than one good run on a hard
 * chart does. The top ~50 are effectively the whole number.
 */
export const SKILL_DECAY = 0.95;

/**
 * Accuracy is raised to this power before it multiplies the chart rating.
 *
 * The top of the accuracy range is where all the difficulty is. 99% is not
 * 1.03× as good as 96% — it is several orders more practice — and a linear
 * weight would say otherwise. At 12: 99% keeps 89% of a chart's value, 96%
 * keeps 61%, 90% keeps 28%, 80% keeps 7%. Scraping a clear on a hard chart is
 * worth something, and is worth much less than playing it well.
 */
export const SKILL_ACCURACY_EXPONENT = 12;

/** Scales the result into human-readable territory. Cosmetic, not structural. */
export const SKILL_SCALE = 100;

/**
 * How many per-chart contributions are considered.
 *
 * At {@link SKILL_DECAY}, contribution 500 is weighted `0.95^499 ≈ 1e-11`;
 * anything past a few hundred is arithmetically absent. The cap exists so the
 * query behind it is bounded for a player with thousands of ranked scores, not
 * because the tail would otherwise matter.
 */
export const SKILL_CONTRIBUTION_CAP = 500;

/** One chart's best performance, as the skill rating sees it. */
export interface SkillContribution {
  /** The chart's C3 rating, 0–{@link MAX_RATING}. */
  chartRating: number;
  /** 0–1. */
  accuracy: number;
}

/**
 * One entry's value before decay. Also the comparison key for "best per chart".
 *
 * Both inputs are floored through {@link nonNegative}/{@link clamp01} rather
 * than trusted. `Math.max(0, NaN)` is `NaN`, and one NaN anywhere in the list
 * propagates through the sum to make the player's entire rating NaN — which
 * then goes into a `Float` column that the global board's `ORDER BY` reads. A
 * single malformed `Chart.rating` must not be able to erase one account from
 * the leaderboard.
 */
export function contributionOf(c: SkillContribution): number {
  return (
    nonNegative(c.chartRating) *
    Math.pow(clamp01(c.accuracy), SKILL_ACCURACY_EXPONENT) *
    SKILL_SCALE
  );
}

/**
 * The skill rating for a set of per-chart bests.
 *
 * Pure and total: it sorts a copy, never mutates the input, and returns 0 for
 * an empty list.
 *
 * Input must be **one entry per chart**. That rule is what stops a chart played
 * four hundred times from counting four hundred times, and this function cannot
 * enforce it because it cannot see chart identity — `collectContributions()` in
 * `rating.server.ts` is what guarantees it.
 */
export function skillRating(best: readonly SkillContribution[]): number {
  return best
    .map(contributionOf)
    .sort((a, b) => b - a)
    .slice(0, SKILL_CONTRIBUTION_CAP)
    .reduce((sum, value, i) => sum + value * Math.pow(SKILL_DECAY, i), 0);
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * A coarse band for a rating, for badges and filters.
 *
 * Bands, not the raw number, are what a library filter should offer: "I want
 * something around 12" is a real request and "I want exactly 12.4" is not.
 */
export const RATING_BANDS = [
  { max: 4, key: 'beginner' },
  { max: 8, key: 'easy' },
  { max: 12, key: 'moderate' },
  { max: 15, key: 'hard' },
  { max: 17.5, key: 'expert' },
  { max: Infinity, key: 'extreme' },
] as const;

export type RatingBand = (typeof RATING_BANDS)[number]['key'];

/** The band a rating falls in. */
export function ratingBand(rating: number | null | undefined): RatingBand | null {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null;
  return (RATING_BANDS.find((b) => rating < b.max) ?? RATING_BANDS[RATING_BANDS.length - 1]).key;
}
