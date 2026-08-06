/**
 * Slice It — persisting the chart rating (`C3`) and computing the global skill
 * rating (`R2`).
 *
 * The arithmetic that makes a chart a number lives in `rating.ts` and is
 * browser-safe on purpose (the editor rates live as you type). This is the half
 * that needs a database: writing a rating onto a row, keeping `Song.chartRating`
 * in step so the library can sort by difficulty, and turning a player's best
 * runs into one skill number.
 *
 * ## Why the skill rating is not `Player.totalScore`
 *
 * `totalScore` sums every score ever submitted. That ranks **volume played**: a
 * player who grinds an easy chart four hundred times outranks a better player
 * who does not, and no amount of tuning the score formula changes that, because
 * the quantity being summed grows without bound with time spent.
 *
 * `skillRating` is built from each player's **best per chart** — one
 * contribution per chart, no matter how many times it was played — weighted by
 * how hard the chart is and how accurately it was played, and summed with
 * geometric decay so the top ~50 dominate. Grinding a chart you have already
 * beaten adds nothing. Grinding *more charts* adds a rapidly vanishing amount.
 * The only way the number moves meaningfully is to play something harder, or
 * play something better.
 *
 * `totalScore` is kept, untouched, as the lifetime statistic it always was.
 *
 * ## Recomputed on write, never on read
 *
 * A leaderboard page must not recompute every player's rating: that is one
 * aggregate per row per request over a table that grows with the library. The
 * recompute runs when a player sets a new best on a ranked chart —
 * `scheduleSkillRecompute()` from the score route — and the board read is an
 * indexed `ORDER BY "skillRating" DESC`.
 */

import { prisma } from '@/lib/prisma.server';
import { rateChart, RATING_VERSION } from './rating';
import type { Slice } from './types';

/* ══ C3 — writing a rating onto a chart ═══════════════════════════════════ */

/**
 * Rate one chart from its stored notes and persist the result.
 *
 * Returns the rating, or null when the chart does not exist. Safe to call
 * repeatedly: it is a pure function of the note list, so re-rating an unchanged
 * chart writes the same number.
 *
 * The song's `duration` is passed to the rater as a floor on the measured span,
 * so a chart whose notes stop two minutes early is not read as a short chart.
 */
export async function rateAndStoreChart(chartId: string): Promise<number | null> {
  const chart = await prisma.chart.findUnique({
    where: { id: chartId },
    select: { id: true, songId: true, notes: true, song: { select: { duration: true } } },
  });
  if (!chart) return null;

  const rating = rateChart(asSlices(chart.notes), chart.song.duration);

  await prisma.chart.update({
    where: { id: chart.id },
    data: { rating, ratingVersion: RATING_VERSION, ratedAt: new Date() },
    select: { id: true },
  });

  await syncSongChartRating(chart.songId);
  return rating;
}

/**
 * Refresh `Song.chartRating` — the denormalised "hardest playable chart of this
 * song", which is what the library's difficulty sort orders by.
 *
 * **The hardest, not the average.** A song with an easy chart and an expert one
 * is a song you can find when looking for something hard; averaging them makes
 * it findable as neither. The library filters within a song once you open it.
 *
 * Only `public` charts count. A draft is the author's private working copy and
 * must not move the song's public position in a sorted list — that would leak
 * the existence and difficulty of unpublished work.
 *
 * Null when the song has no rated public chart, which is every song today: the
 * generated `Song.analysisData` fallback is not a `Chart` row. A null sorts
 * last rather than as a zero, because "not rated" is not "trivially easy".
 */
export async function syncSongChartRating(songId: string): Promise<number | null> {
  const hardest = await prisma.chart.aggregate({
    where: { songId, status: 'public', rating: { not: null } },
    _max: { rating: true },
  });
  const chartRating = hardest._max.rating ?? null;

  await prisma.song.update({
    where: { id: songId },
    data: { chartRating },
    select: { id: true },
  });
  return chartRating;
}

/**
 * Re-rate charts whose stored rating came from an older `RATING_VERSION`.
 *
 * This is the other half of versioning the algorithm: bumping the version is
 * only useful if something can find the rows it invalidated. Batched and
 * bounded so it can be driven from a job on a schedule rather than as one
 * transaction over the whole library — the caller loops until it returns 0.
 *
 * Charts are re-rated oldest-rating-version first, and a null version (never
 * rated) sorts first under Postgres's `NULLS FIRST` default for ASC — which is
 * the order we want anyway: an unrated chart is more wrong than a stale one.
 */
export async function rerateStaleCharts(batchSize = 100): Promise<number> {
  const stale = await prisma.chart.findMany({
    where: { OR: [{ ratingVersion: null }, { ratingVersion: { lt: RATING_VERSION } }] },
    orderBy: [{ ratingVersion: 'asc' }, { updatedAt: 'asc' }],
    take: batchSize,
    select: { id: true, songId: true, notes: true, song: { select: { duration: true } } },
  });

  const touchedSongs = new Set<string>();
  for (const chart of stale) {
    const rating = rateChart(asSlices(chart.notes), chart.song.duration);
    await prisma.chart.update({
      where: { id: chart.id },
      data: { rating, ratingVersion: RATING_VERSION, ratedAt: new Date() },
      select: { id: true },
    });
    touchedSongs.add(chart.songId);
  }

  for (const songId of touchedSongs) await syncSongChartRating(songId);
  return stale.length;
}

/**
 * Read a `Json` notes column as a note list.
 *
 * The column is `Json` and Prisma types it as `JsonValue`, so this is the one
 * cast. It filters rather than asserts: a malformed element would otherwise
 * reach `rateChart`, where `n.time` is `undefined`, `NaN` propagates through the
 * weighted sum, and the chart silently rates `NaN` — which is neither a number
 * a column should hold nor one a sort can order.
 */
function asSlices(notes: unknown): Slice[] {
  if (!Array.isArray(notes)) return [];
  return notes.filter(
    (n): n is Slice =>
      typeof n === 'object' &&
      n !== null &&
      typeof (n as Slice).time === 'number' &&
      typeof (n as Slice).lane === 'number' &&
      typeof (n as Slice).type === 'string',
  );
}

/* ══ R2 — the global skill rating ═════════════════════════════════════════ */

/**
 * Geometric decay applied down the sorted list of per-chart contributions.
 *
 * This is what makes the number a skill measure rather than a play counter: a
 * player's 200th-best chart contributes `0.95^199 ≈ 0.004` of its value, so a
 * hundred more easy clears move the total by less than one good run on a hard
 * chart does. The top ~50 are effectively the whole number (they carry ~92% of
 * the maximum possible sum).
 */
export const SKILL_DECAY = 0.95;

/**
 * Accuracy is raised to this power before it multiplies the chart rating.
 *
 * The top of the accuracy range is where all the difficulty is. 99% is not
 * 1.03× as good as 96% — it is several orders more practice — and a linear
 * weight would say otherwise. At 12: 99% keeps 89% of a chart's value, 96%
 * keeps 61%, 90% keeps 28%, 80% keeps 7%. Scraping a clear on a hard chart is
 * worth something and is worth much less than playing it well.
 *
 * Like everything in `rating.ts`, this exponent is a judgement awaiting real
 * data, not a derivation.
 */
export const SKILL_ACCURACY_EXPONENT = 12;

/** Scales the result into human-readable territory. Cosmetic, not structural. */
export const SKILL_SCALE = 100;

/**
 * How many per-chart contributions are considered.
 *
 * At `SKILL_DECAY`, contribution 500 is weighted `0.95^499 ≈ 1e-11`; anything
 * past a few hundred is arithmetically absent. The cap exists so the query is
 * bounded for a player with thousands of ranked scores, not because the tail
 * would otherwise matter.
 */
export const SKILL_CONTRIBUTION_CAP = 500;

/** One chart's best performance, as the skill rating sees it. */
export interface SkillContribution {
  /** The chart's C3 rating, 0–20. */
  chartRating: number;
  /** 0–1. */
  accuracy: number;
}

/**
 * The skill rating for a set of per-chart bests.
 *
 * Pure and total: it sorts a copy, never mutates the input, and returns 0 for an
 * empty list. Exported separately from the database read so the weighting can be
 * tested without a Postgres.
 *
 * Input is expected to be **one entry per chart** — the "best per chart" rule is
 * what stops a chart played four hundred times from counting four hundred times,
 * and this function cannot enforce it because it cannot see chart identity.
 * {@link collectContributions} is what guarantees it.
 */
export function skillRating(best: readonly SkillContribution[]): number {
  return best
    .map(
      (b) =>
        Math.max(0, b.chartRating) *
        Math.pow(Math.max(0, Math.min(1, b.accuracy)), SKILL_ACCURACY_EXPONENT) *
        SKILL_SCALE,
    )
    .sort((a, b) => b - a)
    .slice(0, SKILL_CONTRIBUTION_CAP)
    .reduce((sum, value, i) => sum + value * Math.pow(SKILL_DECAY, i), 0);
}

/**
 * A player's best performance on each ranked chart.
 *
 * ## Only `ranked` charts, and only the `none` pool
 *
 * **Ranked** is R10's whole purpose: any uploaded chart feeding the global
 * number means a 15-minute upload can be farmed, and the plausibility bound
 * scales with duration so it does not stop that.
 *
 * **`none`** — the chart exactly as written, at 1.0×, nothing switched on — is
 * a narrower rule than R2 asks for and it is the honest one. The weighting
 * multiplies the chart's rating by the run's accuracy, and the chart's rating
 * describes the chart *as written*: it was computed from note timings at 1.0×.
 * Pairing it with an accuracy achieved at 1.5× speed, or with `oneTrack` on, is
 * arithmetic over two different charts. Rating a chart at the run's speed is the
 * obvious extension (scale every note time by `1/speed` and re-rate) and is
 * deliberately not done here — it is a second thing to calibrate, and shipping
 * it untested would put modifier runs into the ranking on a guess.
 *
 * ## Best per chart, not best per row
 *
 * A player can hold several `SongLeaderboard` rows for one chart — the board is
 * keyed by `(songId, difficulty, modPool, userId)` and a chart can be played at
 * more than one tier. Restricting to `modPool: 'none'` leaves at most one row
 * per (song, difficulty), and several difficulties can point at the same chart
 * row, so the reduce below still keys on `chartId` and keeps the best.
 *
 * "Best" is by **contribution**, not by score. Score is not monotone in
 * contribution: a higher-scoring run with worse accuracy contributes less, and
 * taking the higher score would quietly under-rate the player.
 */
export async function collectContributions(userId: string): Promise<SkillContribution[]> {
  const rows = await prisma.songLeaderboard.findMany({
    where: {
      userId,
      modPool: 'none',
      chartId: { not: null },
      chart: { rankStatus: 'ranked', rating: { not: null } },
    },
    // Ordered so the cap, if it ever bites, drops the least valuable rows.
    // Chart rating is the dominant term, so it is the right proxy — and unlike
    // the contribution itself it is a column the database can sort on.
    orderBy: [{ chart: { rating: 'desc' } }, { accuracy: 'desc' }],
    take: SKILL_CONTRIBUTION_CAP * 4,
    select: { chartId: true, accuracy: true, chart: { select: { rating: true } } },
  });

  const bestByChart = new Map<string, SkillContribution>();
  for (const row of rows) {
    const chartRating = row.chart?.rating;
    if (!row.chartId || typeof chartRating !== 'number') continue;
    // A row written before `accuracy` was recorded has null. It is not zero —
    // zero would be a claim the run was a total miss — so it is skipped.
    if (typeof row.accuracy !== 'number') continue;

    const candidate: SkillContribution = { chartRating, accuracy: row.accuracy };
    const held = bestByChart.get(row.chartId);
    if (!held || contributionOf(candidate) > contributionOf(held)) {
      bestByChart.set(row.chartId, candidate);
    }
  }

  return [...bestByChart.values()];
}

/** One entry's value before decay. The comparison key for "best per chart". */
function contributionOf(c: SkillContribution): number {
  return c.chartRating * Math.pow(Math.max(0, Math.min(1, c.accuracy)), SKILL_ACCURACY_EXPONENT);
}

/**
 * Recompute and store one player's skill rating.
 *
 * No-ops for an account with no `Player` row: a player who has never submitted a
 * score has nothing to rate, and creating a row here would mint profiles for
 * accounts that never played the game.
 */
export async function recomputeSkillRating(userId: string): Promise<number> {
  const contributions = await collectContributions(userId);
  const rating = Math.round(skillRating(contributions) * 100) / 100;

  await prisma.player.updateMany({
    where: { userId },
    data: { skillRating: rating, rankedPlays: contributions.length, skillRatedAt: new Date() },
  });

  return rating;
}

/**
 * Fire a recompute without making the caller wait for it, or fail on it.
 *
 * The score route's job is to store a score and answer. A skill rating that is
 * a few hundred milliseconds stale is invisible; a 500 on the submission
 * because an aggregate was slow is not. Failures are logged and swallowed for
 * the same reason the run-history write is best-effort — the player's score is
 * already safe, and the next new best recomputes from scratch anyway, so a
 * dropped recompute is self-healing rather than a permanent wrong number.
 */
export function scheduleSkillRecompute(userId: string): void {
  void recomputeSkillRating(userId).catch((error: unknown) => {
    console.warn('[slice-it] skill rating recompute failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
