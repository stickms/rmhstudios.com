/**
 * Storing sight reading results (plan task S5) — the pure rules the server applies before it
 * writes anything. Client-safe and pure; `sprint.server.ts` does the reading and writing.
 *
 * - **The day.** A daily result carries the UTC date it was dealt on. The server accepts it only
 *   if that is today's UTC date, or yesterday's within `DATE_GRACE_MS` after midnight (a run that
 *   straddled it). It never relabels a result to another date.
 * - **The score is recomputed.** The client sends every prompt's result; the server checks each
 *   one against its level (kind, skips, times) and recomputes the points from the time with the
 *   same `promptPoints` the game uses, then the summary. The client's `points` are ignored. (The
 *   server cannot know which notes were played, so `correct` and the times are the client's: this
 *   keeps an honest client's score honest, it is not anti-cheat.)
 * - **A retried save is the same run** (`sameRun`): equal recomputed results.
 */
import { utcDate, isUtcDate } from './generate';
import {
  BAR_NOTES,
  DAILY_LEVELS,
  DAILY_PROMPTS_PER_LEVEL,
  FREEPLAY_PROMPTS,
  micAllowed,
  sprintLevel,
  type SprintLevelId,
} from './levels';
import { promptPoints, summarizeRun, type PromptResult, type RunSummary } from './scoring';

/** How long after UTC midnight a run dealt the day before may still be saved for that day. */
export const DATE_GRACE_MS = 10 * 60_000;

/** The longest prompt time stored (an hour); a longer one is not a real answer. */
export const MAX_PROMPT_MS = 3_600_000;

/** Whether a daily result dealt on `dealt` may be saved at `now` (ms since the epoch). */
export function acceptDealtDate(dealt: string, now: number): boolean {
  if (!isUtcDate(dealt)) return false;
  return dealt === utcDate(now) || dealt === utcDate(now - DATE_GRACE_MS);
}

/** A checked run: the results with recomputed points, and their summary. */
export interface CheckedRun {
  results: PromptResult[];
  summary: RunSummary;
}

/** One prompt's result, checked against the level it claims and re-scored; null when impossible. */
function checkPrompt(r: PromptResult, level: SprintLevelId): PromptResult | null {
  const def = sprintLevel(level);
  if (!def || r.level !== level || r.kind !== def.kind) return null;
  const noteMs = r.noteMs.map((ms) => Math.round(ms));
  if (noteMs.length > BAR_NOTES || noteMs.some((ms) => !(ms >= 0 && ms <= MAX_PROMPT_MS))) return null;
  if (r.skipped) {
    // Only a chord is ever skipped (the microphone cannot hear one), and a skip has no answer.
    if (micAllowed(def.kind) || r.correct || r.ms !== null || noteMs.length > 0) return null;
    return {
      level,
      kind: def.kind,
      correct: false,
      ms: null,
      noteMs: [],
      points: 0,
      skipped: true,
    };
  }
  if (r.ms === null || !(r.ms >= 0 && r.ms <= MAX_PROMPT_MS)) return null;
  const ms = Math.round(r.ms);
  const notes = def.kind === 'bar' ? BAR_NOTES : 1;
  return {
    level,
    kind: def.kind,
    correct: r.correct,
    ms,
    noteMs,
    points: promptPoints(def.kind, ms, r.correct, notes),
    skipped: false,
  };
}

function checkRun(results: readonly PromptResult[], levels: readonly SprintLevelId[]): CheckedRun | null {
  if (results.length !== levels.length) return null;
  const out: PromptResult[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const level = levels[i];
    if (!r || !level) return null;
    const checked = checkPrompt(r, level);
    if (!checked) return null;
    out.push(checked);
  }
  const summary = summarizeRun(out);
  if (summary.played === 0) return null;
  return {
    results: out,
    summary,
  };
}

/** A freeplay run: `FREEPLAY_PROMPTS` prompts of one level, at least one played. */
export function checkFreeplayRun(level: SprintLevelId, results: readonly PromptResult[]): CheckedRun | null {
  return checkRun(
    results,
    Array.from(
      {
        length: FREEPLAY_PROMPTS,
      },
      () => level,
    ),
  );
}

/** The daily levels in order, `DAILY_PROMPTS_PER_LEVEL` prompts each. */
const DAILY_ORDER: readonly SprintLevelId[] = DAILY_LEVELS.flatMap((id) =>
  Array.from(
    {
      length: DAILY_PROMPTS_PER_LEVEL,
    },
    () => id,
  ),
);

/** A daily run: every daily level in order, five prompts each, at least one played. */
export function checkDailyRun(results: readonly PromptResult[]): CheckedRun | null {
  return checkRun(results, DAILY_ORDER);
}

/** Whether two checked runs are the same run (a retried save). `stored` may be anything from the DB. */
export function sameRun(stored: unknown, results: readonly PromptResult[]): boolean {
  if (!Array.isArray(stored) || stored.length !== results.length) return false;
  return JSON.stringify(stored.map(canonical)) === JSON.stringify(results.map(canonical));
}

function canonical(r: unknown): unknown {
  if (!r || typeof r !== 'object') return r;
  const p = r as Partial<PromptResult>;
  return [p.level, p.kind, p.correct, p.ms, p.noteMs, p.points, p.skipped];
}

/** A level's best: the highest score and, independently, the fastest average reaction. */
export interface SprintBest {
  bestScore: number;
  bestAvgMs: number | null;
}

export function nextBest(prev: SprintBest | null, run: Pick<RunSummary, 'score' | 'avgMs'>): SprintBest {
  if (!prev)
    return {
      bestScore: run.score,
      bestAvgMs: run.avgMs,
    };
  const avgs = [prev.bestAvgMs, run.avgMs].filter((x): x is number => x !== null);
  return {
    bestScore: Math.max(prev.bestScore, run.score),
    bestAvgMs: avgs.length === 0 ? null : Math.min(...avgs),
  };
}

const DAY_MS = 86_400_000;

/**
 * Days in a row with a scored daily run, ending today or yesterday (today may not be played yet).
 * `dates` are scored dates in any order.
 */
export function dailyStreak(dates: readonly string[], today: string): number {
  const have = new Set(dates);
  let day = Date.parse(`${today}T00:00:00Z`);
  if (!have.has(today)) day -= DAY_MS;
  let n = 0;
  while (have.has(utcDate(day))) {
    n++;
    day -= DAY_MS;
  }
  return n;
}
