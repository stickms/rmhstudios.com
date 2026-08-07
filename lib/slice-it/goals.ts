/**
 * Slice It — the single-player structures (`S3`, `S5`, `S6`, `S7`, `S10`).
 *
 * Every chart currently offers exactly one goal: a higher number. There is no
 * notion of a player's level, no reason to play chart B after chart A, and
 * nothing to chase on a chart you have already maxed.
 *
 * One module because all five are the same shape — *a condition evaluated
 * against a finished run* — and writing that evaluator five times is how the
 * five drift apart.
 *
 * ## The rule every goal here obeys
 *
 * **A goal may only read data the run already produces.** `RunStats` and
 * `Modifiers` are the whole input. The moment a goal needs something else, every
 * new goal type becomes a schema change and a migration, and the feature stops
 * being cheap enough to add to.
 *
 * Pure and browser-safe: the results screen evaluates goals locally for instant
 * feedback and the score route evaluates the same ones for the reward.
 */

import { createSeededRandom } from './chart';
import type { Modifiers, RunStats, Slice } from './types';

/* ─── The goal vocabulary ────────────────────────────────────────────────── */

export type Goal =
  | { kind: 'clear' }
  | { kind: 'accuracy'; min: number }
  | { kind: 'score'; min: number }
  | { kind: 'combo'; min: number }
  | { kind: 'fc'; modifiers?: string[] }
  | { kind: 'perfect' }
  | { kind: 'no-hold-drops' };

/**
 * Whether a finished run satisfies a goal.
 *
 * `clear` is `notesResolved > 0 && !failed` rather than just the note count: a
 * run that the gauge killed at 0:20 resolved plenty of notes, and calling that
 * a clear would make the whole campaign trivially completable by dying.
 */
export function meetsGoal(goal: Goal, stats: RunStats, mods: Modifiers): boolean {
  switch (goal.kind) {
    case 'clear':
      return stats.notesResolved > 0 && !stats.failed;
    case 'accuracy':
      return !stats.failed && stats.accuracy >= goal.min;
    case 'score':
      return !stats.failed && stats.score >= goal.min;
    case 'combo':
      return stats.maxCombo >= goal.min;
    case 'fc':
      return (
        !stats.failed &&
        stats.judgements.MISS === 0 &&
        // Every named modifier must have been ON. `some` would let "FC with
        // bombs" be satisfied by an FC with mirror, which is a different feat.
        //
        // Via `unknown` because `Modifiers` has no index signature — the goal's
        // `modifiers` are strings from stored campaign data, so an unknown key
        // is a legitimate runtime possibility and reads as `undefined` (falsy),
        // which fails the goal rather than silently satisfying it.
        (goal.modifiers ?? []).every((key) =>
          Boolean((mods as unknown as Record<string, unknown>)[key]),
        )
      );
    case 'perfect':
      // Every resolved note MARVELOUS — the game's existing definition, which
      // `RunStats.isPerfect` already carries and the H7 badge already shows.
      // Inventing a looser one here would mean a mission and a badge disagreeing
      // about the same run on the same screen.
      return !stats.failed && stats.isPerfect;
    case 'no-hold-drops':
      // A dropped hold judges as a MISS on the release (`G5`), so an FC and a
      // clean hold run are the same assertion on the data available. Kept as a
      // distinct goal because it READS differently on a chart full of holds,
      // which is the only place it is offered.
      return !stats.failed && stats.judgements.MISS === 0;
  }
}

/** A human description, for the mission list and the campaign map. */
export function describeGoal(goal: Goal): string {
  switch (goal.kind) {
    case 'clear':
      return 'Clear it';
    case 'accuracy':
      return `${(goal.min * 100).toFixed(1)}% accuracy`;
    case 'score':
      return `${goal.min.toLocaleString()} points`;
    case 'combo':
      return `${goal.min} combo`;
    case 'fc':
      return goal.modifiers?.length
        ? `Full combo with ${goal.modifiers.join(', ')}`
        : 'Full combo';
    case 'perfect':
      return 'Perfect — nothing below MARVELOUS';
    case 'no-hold-drops':
      return 'Hold every note';
  }
}

/* ─── S6 — per-chart missions ────────────────────────────────────────────── */

export interface Mission {
  id: string;
  goal: Goal;
  /** Coins on first completion. */
  reward: number;
}

/**
 * Three objectives derived from the chart's own shape.
 *
 * Two rules, both load-bearing:
 *
 *  1. **Derived from the chart**, so a chart with no holds is never asked for a
 *     hold mission. A mission that cannot be completed is worse than no mission
 *     — it reads as the game being broken rather than as a challenge.
 *  2. **Seeded by the chart hash**, so everyone sees the same three and they
 *     survive a page reload. A per-session shuffle would mean two players
 *     comparing missions on the same chart see different lists.
 */
export function missionsFor(chart: readonly Slice[], chartHash: string): Mission[] {
  if (chart.length === 0) return [];

  const hasHolds = chart.some((note) => note.type === 'LONG');
  const pool: Mission[] = [
    { id: 'acc-95', goal: { kind: 'accuracy', min: 0.95 }, reward: 15 },
    { id: 'acc-98', goal: { kind: 'accuracy', min: 0.98 }, reward: 30 },
    {
      id: 'combo-half',
      goal: { kind: 'combo', min: Math.max(10, Math.floor(chart.length * 0.5)) },
      reward: 10,
    },
    {
      id: 'combo-most',
      goal: { kind: 'combo', min: Math.max(20, Math.floor(chart.length * 0.8)) },
      reward: 20,
    },
    { id: 'fc', goal: { kind: 'fc' }, reward: 40 },
    ...(hasHolds
      ? [{ id: 'holds', goal: { kind: 'no-hold-drops' } as Goal, reward: 20 }]
      : []),
  ];

  const rng = createSeededRandom(`slice-missions:${chartHash}`);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Sorted by reward so the list reads easy-to-hard, which is not the order the
  // shuffle produced — the shuffle decides WHICH three, not how they are shown.
  return shuffled.slice(0, 3).sort((a, b) => a.reward - b.reward);
}

/* ─── S10 — score attack tiers ───────────────────────────────────────────── */

export type ScoreTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export const SCORE_TIERS: readonly ScoreTier[] = ['bronze', 'silver', 'gold', 'platinum'];

/**
 * Fractions of a chart's theoretical maximum that earn each tier.
 *
 * Fractions rather than absolute numbers, for the same reason `S7`'s boss curve
 * is: a target that is trivial on a short chart and impossible on a long one is
 * not a difficulty setting, it is a chart-length setting.
 */
const TIER_FRACTION: Record<ScoreTier, number> = {
  bronze: 0.6,
  silver: 0.78,
  gold: 0.9,
  platinum: 0.97,
};

export function scoreTargets(maxScore: number): Record<ScoreTier, number> {
  return Object.fromEntries(
    SCORE_TIERS.map((tier) => [tier, Math.floor(maxScore * TIER_FRACTION[tier])]),
  ) as Record<ScoreTier, number>;
}

/** The highest tier a score reaches, or null below bronze. */
export function tierFor(score: number, maxScore: number): ScoreTier | null {
  const targets = scoreTargets(maxScore);
  let best: ScoreTier | null = null;
  for (const tier of SCORE_TIERS) {
    if (score >= targets[tier]) best = tier;
  }
  return best;
}

/* ─── S7 — the boss curve ────────────────────────────────────────────────── */

/**
 * A per-second score line to race, derived from the chart's own achievable
 * score.
 *
 * Generated from the chart rather than from a fixed number: a boss that is
 * trivial on a short chart and impossible on a long one is a chart-length
 * setting wearing a difficulty setting's clothes.
 *
 * `perfectCurve` is the cumulative score of a flawless run, one value per
 * second — the same shape `P9`'s ghost uses, which is what lets the boss render
 * through the pace bar that already exists.
 */
export function bossCurve(perfectCurve: readonly number[], tier: number): number[] {
  const fraction = [0.72, 0.85, 0.94][tier] ?? 0.94;
  return perfectCurve.map((value) => Math.floor(value * fraction));
}

/**
 * Gauge lost for falling behind the boss at a section boundary.
 *
 * Per SECTION rather than per second: a boss that drains continuously while you
 * are behind is a timer, and one that checks once at the end is a score
 * comparison. Checking at boundaries is what makes it feel like a fight with
 * rounds in it.
 */
export const BOSS_SECTION_PENALTY = 15;

export function bossVerdict(
  yourScore: number,
  bossScore: number,
): { ahead: boolean; penalty: number } {
  const ahead = yourScore >= bossScore;
  return { ahead, penalty: ahead ? 0 : BOSS_SECTION_PENALTY };
}

/* ─── S3 — the certification ladder ──────────────────────────────────────── */

export interface DanCourse {
  id: string;
  name: string;
  /** Order, ascending. Used for "highest dan held". */
  rank: number;
  /** `C3` rating floor the member charts are expected to sit at. */
  minRating: number;
  /** Fixed chart ids. See below — this list may never change once published. */
  charts: string[];
}

/**
 * The ladder.
 *
 * **Fixed setlists, never generated.** A certification whose contents change is
 * not a certification: the entire value of "4th Dan" is that it means the same
 * thing to two people who earned it a year apart. That is also why a published
 * course's `charts` array is immutable — editing one silently redefines every
 * badge already awarded from it.
 *
 * Empty until a moderator populates it. Deliberately: seeding this with charts
 * picked by the generator would define the ladder by whatever happened to be in
 * the library on the day, which is precisely the arbitrariness the fixed list
 * exists to avoid.
 */
export const DAN_COURSES: DanCourse[] = [];

/** Whether a course run passes. Dan is pass/fail on the gauge — no partials. */
export function passesDan(runs: readonly RunStats[], course: DanCourse): boolean {
  if (runs.length !== course.charts.length) return false;
  return runs.every((stats) => !stats.failed);
}

/** The highest dan among a set of held ids. */
export function highestDan(held: readonly string[]): DanCourse | null {
  let best: DanCourse | null = null;
  for (const course of DAN_COURSES) {
    if (held.includes(course.id) && (!best || course.rank > best.rank)) best = course;
  }
  return best;
}

/* ─── S5 — the campaign ──────────────────────────────────────────────────── */

export interface CampaignStage {
  id: string;
  chartId: string;
  goal: Goal;
  /** `skin.neon`, `coins:50`, `hitsound.taiko` — resolved by the reward layer. */
  reward: string;
}

export interface CampaignChapter {
  id: string;
  name: string;
  stages: CampaignStage[];
}

/**
 * Which stages a player may attempt.
 *
 * Sequential within a chapter, and a chapter opens when the previous one is
 * finished. **Unlocks are cosmetics, never charts** — the library stays fully
 * open, because gating songs behind a campaign would make a shared library
 * uneven between two people looking at the same page.
 */
export function unlockedStages(
  chapters: readonly CampaignChapter[],
  completed: ReadonlySet<string>,
): string[] {
  const open: string[] = [];
  for (const chapter of chapters) {
    let chapterDone = true;
    for (const stage of chapter.stages) {
      if (completed.has(stage.id)) continue;
      // The first incomplete stage of this chapter is playable; nothing after
      // it is.
      open.push(stage.id);
      chapterDone = false;
      break;
    }
    // A chapter with an incomplete stage blocks every later chapter.
    if (!chapterDone) break;
  }
  return open;
}

/** How far through the campaign a player is, 0–1. */
export function campaignProgress(
  chapters: readonly CampaignChapter[],
  completed: ReadonlySet<string>,
): number {
  const total = chapters.reduce((sum, chapter) => sum + chapter.stages.length, 0);
  if (total === 0) return 0;
  const done = chapters.reduce(
    (sum, chapter) => sum + chapter.stages.filter((stage) => completed.has(stage.id)).length,
    0,
  );
  return done / total;
}
