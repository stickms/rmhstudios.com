/**
 * Slice It — multi-song session modes.
 *
 * `P7` (adaptive warm-up), `S4` (endless survival), `S11` (marathon) and `S12`
 * (time attack) are four different answers to the same question: what plays
 * after this song ends. They share one reducer rather than four, because the
 * only things that actually differ between them are which chart comes next and
 * what ends the session — and writing that four times is how they drift.
 *
 * Pure and browser-safe. Nothing here reads the clock, the store or the
 * network: a session is a value the caller advances, so it can be unit-tested
 * and replayed without a game running.
 */

import { createSeededRandom } from './chart';

export type SessionMode = 'warmup' | 'endless' | 'marathon' | 'timeAttack';

export interface SessionRun {
  /** 0–1. */
  accuracy: number;
  cleared: boolean;
  score: number;
  /** Seconds of audio actually played. */
  duration: number;
}

export interface SessionState {
  mode: SessionMode;
  /** Charts already played, oldest first. */
  history: string[];
  /** Cumulative score across the session. */
  score: number;
  /**
   * The rating the next chart is chosen at (`C3`'s scale). Moves only in
   * `warmup` and `endless`.
   */
  targetRating: number;
  /** How aggressively the gauge drains, for `endless`. 1 is normal. */
  drainMultiplier: number;
  /** Seconds of gameplay elapsed, for `timeAttack`. Menus do not count. */
  elapsed: number;
  /** Set once the session is over, with the reason. */
  ended: null | 'failed' | 'time' | 'stopped';
}

export interface SessionLimits {
  /** `timeAttack` only — how long the session runs, seconds. */
  timeLimit?: number;
}

/** A fresh session at a starting difficulty. */
export function startSession(mode: SessionMode, startRating: number): SessionState {
  return {
    mode,
    history: [],
    score: 0,
    targetRating: clampRating(startRating),
    drainMultiplier: 1,
    elapsed: 0,
    ended: null,
  };
}

/**
 * `C3` ratings run 1–20. Clamped rather than allowed to run away: an endless
 * session that has been going well for twenty songs should keep asking for the
 * hardest charts that exist, not for a rating no chart has.
 */
function clampRating(rating: number): number {
  if (!Number.isFinite(rating)) return 5;
  return Math.max(1, Math.min(20, rating));
}

/**
 * `P7` — where the ladder goes after a run.
 *
 * Asymmetric on purpose. Failing drops further than clearing raises, because a
 * plateau that takes four clears to escape reads as a wall, while one that
 * takes four failures to fall out of reads as the game noticing. The target is
 * roughly a 75% clear rate: high enough to feel like progress, low enough that
 * the ladder is still climbing.
 */
export function nextRating(current: number, run: SessionRun): number {
  if (!run.cleared) return clampRating(current - 1.2);
  if (run.accuracy > 0.97) return clampRating(current + 0.8);
  if (run.accuracy > 0.9) return clampRating(current + 0.4);
  return clampRating(current);
}

/**
 * `S4` — how much harder endless gets, per song survived.
 *
 * Difficulty AND drain escalate together. Escalating only difficulty means a
 * strong player never dies and the mode has no end; escalating only drain
 * means it is a timer with music over it. Logarithmic in the song count so the
 * first few steps are perceptible and the twentieth is not absurd.
 */
export function endlessStep(songsCleared: number, baseRating: number) {
  return {
    targetRating: clampRating(baseRating + Math.log2(songsCleared + 1) * 1.5),
    drainMultiplier: 1 + songsCleared * 0.08,
  };
}

/**
 * Advance a session by one finished run.
 *
 * Returns a NEW state; the caller decides whether to keep it. That matters for
 * `timeAttack`, where the run that crosses the limit still counts — you do not
 * lose the song you were playing because the clock ran out during it.
 */
export function advanceSession(
  state: SessionState,
  chartId: string,
  run: SessionRun,
  limits: SessionLimits = {},
): SessionState {
  if (state.ended) return state;

  const next: SessionState = {
    ...state,
    history: [...state.history, chartId],
    score: state.score + Math.max(0, run.score),
    elapsed: state.elapsed + Math.max(0, run.duration),
  };

  switch (state.mode) {
    case 'warmup':
      next.targetRating = nextRating(state.targetRating, run);
      break;

    case 'endless': {
      if (!run.cleared) {
        // Endless ends on a failure, by definition — that is the score.
        next.ended = 'failed';
        break;
      }
      const step = endlessStep(next.history.length, state.targetRating);
      next.targetRating = step.targetRating;
      next.drainMultiplier = step.drainMultiplier;
      break;
    }

    case 'timeAttack':
      // Checked AFTER the run is banked. A session that discarded the song the
      // clock expired during would punish the player for the length of a chart
      // they did not choose.
      if (limits.timeLimit !== undefined && next.elapsed >= limits.timeLimit) {
        next.ended = 'time';
      }
      break;

    case 'marathon':
      // Nothing gates marathon. It ends when the player stops, which is the
      // whole point of it existing beside `endless`.
      break;
  }

  return next;
}

/** Stop a session deliberately. */
export function stopSession(state: SessionState): SessionState {
  return state.ended ? state : { ...state, ended: 'stopped' };
}

/**
 * Pick the next chart for a session.
 *
 * Takes the candidate pool rather than querying, so this stays pure and the
 * caller can decide what "eligible" means (ranked only, unplayed only, a
 * setlist). Never repeats a chart already played in this session — a session
 * that serves the same song twice reads as broken long before the player
 * works out it was random.
 */
export function pickNextChart(
  state: SessionState,
  pool: { id: string; rating: number | null }[],
  seed: string,
): string | null {
  const played = new Set(state.history);
  const fresh = pool.filter((chart) => !played.has(chart.id));
  if (fresh.length === 0) return null;

  // Marathon and time attack do not ladder, so anything unplayed will do —
  // seeded so a session is reproducible from its seed for testing and for a
  // shared "same queue as me" link.
  const rng = createSeededRandom(`${seed}:${state.history.length}`);
  if (state.mode === 'marathon' || state.mode === 'timeAttack') {
    return fresh[Math.floor(rng() * fresh.length)].id;
  }

  // Laddered modes want the closest rating to the target. Unrated charts sort
  // last rather than being excluded: a pool of entirely unrated charts should
  // still produce a session, just an unladdered one.
  const scored = fresh
    .map((chart) => ({
      chart,
      distance: chart.rating === null ? Infinity : Math.abs(chart.rating - state.targetRating),
    }))
    .sort((a, b) => a.distance - b.distance);

  // Choose among the closest few rather than strictly the nearest, or a
  // session at a stable rating serves the same chart every time the player
  // reaches that rung.
  //
  // A FRACTION of the pool, not a fixed count. A flat "closest 5" is the whole
  // pool on a small library — which is every new install — so the ladder would
  // silently degrade to random selection at exactly the point a player is most
  // likely to notice the game handing them something far too hard.
  const bandSize = Math.max(1, Math.min(5, Math.ceil(scored.length / 3)));
  const band = scored.slice(0, bandSize);
  return band[Math.floor(rng() * band.length)].chart.id;
}

/**
 * `M8` — the week's fixed modifier set.
 *
 * Derived from the ISO week key, so every client computes the same set with no
 * table and no coordination — the same trick `S1`'s daily uses, and for the
 * same reason: a rotation that needs a writer needs a writer that never fails.
 *
 * Fixed rather than player-chosen is the entire feature. `MODIFIER_BONUSES`
 * makes stacking rewarding, so a leaderboard converges on one optimal stack per
 * player and the other combinations are never seen by anyone. A week where
 * everybody plays the same unusual configuration is the only time most of them
 * get used.
 */
export function weeklyModifierKeys(weekKey: string): string[] {
  const pool = ['bombs', 'switching', 'spin', 'strictTiming', 'oneTrack', 'sRandom'];
  const rng = createSeededRandom(`slice-weekly:${weekKey}`);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 2).sort();
}

/** ISO-ish week key (`2026-W32`) in UTC, matching the daily's day-key style. */
export function weekKeyOf(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of the current week decides the year, per ISO 8601 — without this
  // the last days of December land in week 1 of the wrong year.
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
