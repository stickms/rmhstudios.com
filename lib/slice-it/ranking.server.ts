/**
 * Slice It — the ranked chart pool (`R10`).
 *
 * ## The hole this closes
 *
 * Every uploaded chart feeds the same global career total. A player can upload
 * a 15-minute track, let the generator chart it into an enormous note count,
 * and farm it. The plausibility bound in `scoring.ts` does not stop this and
 * cannot: it derives a ceiling **from the track's duration**, so a longer track
 * buys a proportionally larger ceiling. The bound is the line between a real run
 * and a typed-in number; it was never a line between a fair chart and a farm.
 *
 * The fix is structural rather than arithmetic. A chart is `unranked` until it
 * has proved itself, and only `ranked` charts feed the R2 skill rating. There is
 * no number you can tune that achieves this, which is why every mature rhythm
 * game has a ranking process rather than a cleverer score formula.
 *
 * ## unranked → qualified → ranked
 *
 * | state       | how it is entered                             | reversible |
 * | ----------- | --------------------------------------------- | ---------- |
 * | `unranked`  | every chart, on creation                       | —          |
 * | `qualified` | automatically, by {@link evaluateQualification} | yes       |
 * | `ranked`    | by a human, via {@link promoteToRanked}         | yes       |
 *
 * **Qualification is automatic and reversible; promotion is a human decision.**
 * Automating the second step means the first bad chart to hit the play
 * threshold enters the pool permanently, and "permanently" is the operative
 * word — scores set on a ranked chart are in players' ratings, so unranking one
 * later takes away a number people earned. A reversible automatic gate in front
 * of an irreversible-in-practice manual one is the shape that lets the automatic
 * half be wrong without costing anybody anything.
 *
 * ## Why `Chart.rankStatus` and not `Chart.status`
 *
 * `status` is the visibility lifecycle (`draft` → `public`) and four call sites
 * already read it as one. Visibility and rankedness are orthogonal: every public
 * chart starts unranked, and being ranked says nothing about who can see it. The
 * long version is in the migration header
 * (`prisma/migrations/20260806170000_slice_it_rating_and_ranked_pool/`).
 */

import { prisma } from '@/lib/prisma.server';
import { hasBlockingErrors, lintNotes, type LintNote } from '@/lib/slice-it/beatmap/lint';
import { DIFFICULTIES, type Difficulty } from './constants';
import { rateAndStoreChart } from './rating.server';
import type { Slice } from './types';

/* ══ The vocabulary ═══════════════════════════════════════════════════════ */

/**
 * The pool states, in escalating order.
 *
 * Declared here rather than in `constants.ts` because `constants.ts` is the
 * client/server shared contract and nothing on the client decides a rank
 * status: the client never sends one, never validates one, and only ever
 * renders one as a badge. If a client surface later needs to *branch* on these,
 * they should move — the rule for that file is "anything a client and the
 * server could disagree about", and today they cannot disagree because only one
 * of them has an opinion. Noted in `docs/_handoff/rating-requests.md` §3.
 */
export const RANK_STATUSES = ['unranked', 'qualified', 'ranked'] as const;
export type RankStatus = (typeof RANK_STATUSES)[number];

export const DEFAULT_RANK_STATUS: RankStatus = 'unranked';

/** Narrow a database column or a query param to a rank status. */
export function isRankStatus(value: unknown): value is RankStatus {
  return typeof value === 'string' && (RANK_STATUSES as readonly string[]).includes(value);
}

/** Coerce anything to a rank status, defaulting rather than throwing. */
export function toRankStatus(value: unknown): RankStatus {
  return isRankStatus(value) ? value : DEFAULT_RANK_STATUS;
}

/* ══ The gate ═════════════════════════════════════════════════════════════ */

/**
 * Distinct runs a chart must have before qualification is even considered.
 *
 * Low enough that a chart on a small library can reach it, high enough that the
 * clear rate below is measured on a sample rather than on one friend. The
 * threshold counts **distinct players**, not runs: fifty runs by one account is
 * one person's opinion of their own chart, which is exactly the farming shape
 * this whole module exists to close.
 */
export const QUALIFY_MIN_PLAYERS = 20;

/** Total runs required alongside the player count. */
export const QUALIFY_MIN_PLAYS = 50;

/**
 * The clear rate a chart must reach, and the one it must not exceed.
 *
 * **Floor.** A chart nobody can finish is either broken or a joke, and either
 * way scores on it are not a skill signal — the only people with a score are the
 * handful who could clear it, and their accuracy on it says more about luck than
 * about ability.
 *
 * **No ceiling.** There deliberately is not one. An easy chart that everybody
 * clears is a perfectly good ranked chart: its C3 rating is low, so it
 * contributes almost nothing to a skill rating, and the weighting handles it
 * without a rule. Adding a ceiling would delete the entire beginner library from
 * the ranked pool to solve a problem the decay already solves.
 */
export const QUALIFY_MIN_CLEAR_RATE = 0.05;

/** Why a chart is not qualified. Returned so a UI can say what is missing. */
export type QualifyBlocker =
  | 'not-found'
  | 'wrong-state'
  | 'not-public'
  | 'lint-errors'
  | 'too-few-players'
  | 'too-few-plays'
  | 'clear-rate-unknown'
  | 'clear-rate-too-low';

export interface QualificationReport {
  chartId: string;
  /** True when every gate passed. */
  eligible: boolean;
  /** Every gate that failed — all of them, not just the first. */
  blockers: QualifyBlocker[];
  players: number;
  plays: number;
  /** null when there are no runs at all to compute one from. */
  clearRate: number | null;
  lintErrors: number;
  /** The state after this call. Unchanged unless a transition happened. */
  status: RankStatus;
}

/**
 * The clear rate of a chart: cleared runs over all runs.
 *
 * Null rather than 0 when there are no runs. The difference matters — 0 is "50
 * people tried and nobody finished", null is "nobody has tried" — and a gate
 * that treats them the same rejects a brand-new chart with the same verdict it
 * gives a broken one.
 *
 * `SliceRun.cleared` is client-declared, and this is the one place that is
 * acceptable: it decides whether a chart is worth ranking, not whether a score
 * counts. Lying about it makes a hard chart look clearable, which gets it
 * ranked, which puts it in front of a human reviewer. The failure mode of a
 * false `cleared` is "a reviewer looks at a chart"; there is no reward path.
 */
export async function clearRate(chartId: string): Promise<number | null> {
  const [total, cleared] = await Promise.all([
    prisma.sliceRun.count({ where: { chartId } }),
    prisma.sliceRun.count({ where: { chartId, cleared: true } }),
  ]);
  return total === 0 ? null : cleared / total;
}

/**
 * Evaluate a chart against the qualification gates and apply the result.
 *
 * Both directions. An `unranked` chart that passes becomes `qualified`; a
 * `qualified` chart that stops passing — the author edited it and introduced a
 * lint error, runs were deleted with an account, the clear rate fell — drops
 * back to `unranked`. That reversibility is the reason qualification can be
 * automatic at all.
 *
 * **`ranked` charts are never touched here.** A human put them in the pool and a
 * human takes them out (`demote()`); an automatic demotion would silently delete
 * a number out of every player's skill rating, and a transient dip in a
 * statistic is not a good enough reason to do that to people.
 *
 * Safe to call on every score submission: it is three counts and a lint over a
 * note list the linter walks in O(n).
 */
export async function evaluateQualification(chartId: string): Promise<QualificationReport> {
  const chart = await prisma.chart.findUnique({
    where: { id: chartId },
    select: {
      id: true,
      notes: true,
      status: true,
      rankStatus: true,
      difficulty: true,
      song: { select: { duration: true } },
    },
  });

  const empty = (blocker: QualifyBlocker, status: RankStatus): QualificationReport => ({
    chartId,
    eligible: false,
    blockers: [blocker],
    players: 0,
    plays: 0,
    clearRate: null,
    lintErrors: 0,
    status,
  });

  if (!chart) return empty('not-found', DEFAULT_RANK_STATUS);

  const status = toRankStatus(chart.rankStatus);
  // A ranked chart is out of scope for the automatic gate, in both directions.
  if (status === 'ranked') return empty('wrong-state', status);

  const [plays, playerGroups, rate] = await Promise.all([
    prisma.sliceRun.count({ where: { chartId } }),
    prisma.sliceRun.groupBy({ by: ['userId'], where: { chartId } }),
    clearRate(chartId),
  ]);
  const players = playerGroups.length;

  const findings = lintNotes({
    difficulty: normaliseDifficulty(chart.difficulty),
    notes: asLintNotes(chart.notes),
    duration: chart.song.duration,
    // No `beats`: the off-grid rule needs a reconstructed metronome, and this
    // gate has no timing map to build one from. Its absence means the rule does
    // not run, which is the documented behaviour and the right one — a chart
    // whose grid we cannot reconstruct is not thereby off-grid.
  });
  const lintErrors = findings.filter((f) => f.severity === 'error').length;

  const blockers: QualifyBlocker[] = [];
  // Visibility first: a draft has not been offered to anybody, so its play
  // counts are the author's own playtests.
  if (chart.status !== 'public') blockers.push('not-public');
  if (hasBlockingErrors(findings)) blockers.push('lint-errors');
  if (players < QUALIFY_MIN_PLAYERS) blockers.push('too-few-players');
  if (plays < QUALIFY_MIN_PLAYS) blockers.push('too-few-plays');
  if (rate === null) blockers.push('clear-rate-unknown');
  else if (rate < QUALIFY_MIN_CLEAR_RATE) blockers.push('clear-rate-too-low');

  const eligible = blockers.length === 0;
  const next: RankStatus = eligible ? 'qualified' : 'unranked';

  if (next !== status) {
    await prisma.chart.update({
      where: { id: chart.id },
      // `rankStatusBy` stays null: there is no actor. That null is how the audit
      // trail distinguishes an automatic transition from a moderator's decision.
      data: { rankStatus: next, rankStatusAt: new Date(), rankStatusBy: null },
      select: { id: true },
    });
  }

  return { chartId, eligible, blockers, players, plays, clearRate: rate, lintErrors, status: next };
}

/**
 * Promote a qualified chart into the ranked pool. **A human decision.**
 *
 * Only from `qualified`: the automatic gate is a prerequisite, not an
 * alternative path, so a moderator cannot rank a chart that has never been
 * played or that does not lint. Returns false when the chart is not in that
 * state, rather than throwing, so an admin surface can report it.
 *
 * The chart is re-rated on the way in. Its C3 rating is about to start
 * multiplying real players' skill ratings, and a rating computed under an older
 * `RATING_VERSION` — or never computed at all — would put a stale number into
 * everybody's total.
 *
 * Existing scores are **not** back-filled into skill ratings here. That is a
 * sweep over every player holding a score on this chart, which belongs in a job
 * and not in the request that flips the flag; until it runs, a player's rating
 * picks the chart up on their next new best. See
 * `docs/_handoff/rating-requests.md` §2.
 */
export async function promoteToRanked(chartId: string, moderatorId: string): Promise<boolean> {
  const chart = await prisma.chart.findUnique({
    where: { id: chartId },
    select: { id: true, rankStatus: true },
  });
  if (!chart || toRankStatus(chart.rankStatus) !== 'qualified') return false;

  await rateAndStoreChart(chartId);
  await prisma.chart.update({
    where: { id: chartId },
    data: { rankStatus: 'ranked', rankStatusAt: new Date(), rankStatusBy: moderatorId },
    select: { id: true },
  });
  return true;
}

/**
 * Take a chart back out of the pool. **Also a human decision**, and the reason
 * `promoteToRanked` is safe to make at all: nothing here is one-way.
 *
 * Drops to `unranked` rather than `qualified`, because a chart pulled out of the
 * pool should not immediately re-qualify on the next submission — a moderator
 * removing a chart is a statement that outlasts the statistics. It re-qualifies
 * only if `evaluateQualification` finds it eligible again, which is the intended
 * appeal path.
 *
 * Every player holding a score on it is now over-rated until their next
 * recompute. That is the same deferred sweep as promotion — same handoff note.
 */
export async function demote(chartId: string, moderatorId: string): Promise<boolean> {
  const chart = await prisma.chart.findUnique({
    where: { id: chartId },
    select: { id: true, rankStatus: true },
  });
  if (!chart || toRankStatus(chart.rankStatus) === 'unranked') return false;

  await prisma.chart.update({
    where: { id: chartId },
    data: { rankStatus: 'unranked', rankStatusAt: new Date(), rankStatusBy: moderatorId },
    select: { id: true },
  });
  return true;
}

/**
 * Whether a submission on this chart should move the player's skill rating.
 *
 * One place, so the score route and any future path agree. Null `chartId` — the
 * generated `Song.analysisData` fallback, which is what every run plays today —
 * is not ranked and cannot be: it has no identity, no author and no lint pass.
 */
export async function isRankedChart(chartId: string | null | undefined): Promise<boolean> {
  if (!chartId) return false;
  const chart = await prisma.chart.findUnique({
    where: { id: chartId },
    select: { rankStatus: true },
  });
  return toRankStatus(chart?.rankStatus) === 'ranked';
}

/* ══ Coercions ════════════════════════════════════════════════════════════ */

/** `Chart.difficulty` is a `VARCHAR(16)`; the linter wants the union. */
function normaliseDifficulty(value: string): Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value) ? (value as Difficulty) : 'normal';
}

/**
 * Read a `Json` notes column as lint input.
 *
 * Malformed elements are dropped rather than passed through. A note with no
 * `time` would make the linter's sort non-deterministic and its density windows
 * meaningless, and the gate would then pass or fail on which order Postgres
 * happened to return the JSON in.
 */
function asLintNotes(notes: unknown): LintNote[] {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter(
      (n): n is Slice =>
        typeof n === 'object' &&
        n !== null &&
        typeof (n as Slice).time === 'number' &&
        typeof (n as Slice).lane === 'number' &&
        typeof (n as Slice).type === 'string',
    )
    .map((n) => ({
      id: String(n.id ?? ''),
      time: n.time,
      lane: n.lane,
      type: n.type,
      duration: typeof n.duration === 'number' ? n.duration : undefined,
    }));
}
