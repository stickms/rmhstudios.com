/**
 * Slice It chart editor — the editor's side of the linter.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §9.
 *
 * The rules themselves are in `@/lib/slice-it/beatmap/lint`, shared with
 * upload-time validation (`C11`). What lives here is the part that is genuinely
 * about the editor: turning store state into a plain, structured-cloneable
 * request (it has to survive `postMessage` to the lint worker), running every
 * difficulty rather than just the open one, and folding the result back into a
 * per-note map the timeline can read in its draw loop without allocating.
 *
 * Every function here is pure. The worker imports this module and so does the
 * synchronous fallback, so there is exactly one lint implementation and the
 * fallback cannot quietly disagree with the worker.
 */

import { DIFFICULTIES } from '@/lib/slice-it/constants';
import {
  countBySeverity,
  hasBlockingErrors,
  lintNesting,
  lintNotes,
  type LintCode,
  type LintFinding,
  type LintNote,
  type LintSeverity,
} from '@/lib/slice-it/beatmap/lint';
import { timeAtBeat } from './snap';
import { singleTimingPoint } from './types';
import type { Charts, Difficulty, EditorNote, LintIssue, TimingPoint } from './types';

export type { LintCode, LintFinding, LintSeverity };
export { hasBlockingErrors, countBySeverity };

/** One difficulty, reduced to what the rules need. */
export interface LintChartRequest {
  difficulty: Difficulty;
  notes: LintNote[];
}

/**
 * The message the worker receives. Plain arrays and numbers only — no `Map`, no
 * class instances, nothing with a prototype worth preserving, so the structured
 * clone is cheap and the same object can be handed to the fallback unchanged.
 */
export interface LintRequest {
  /** The store revision this snapshot was taken at, echoed back in the result. */
  revision: number;
  duration: number;
  /** Beat times for the off-grid rule; empty disables it. */
  beats: number[];
  charts: LintChartRequest[];
  /** Off means the cross-difficulty rule is skipped (nesting mode `off`). */
  checkNesting: boolean;
}

export interface LintResult {
  revision: number;
  findings: LintFinding[];
  errors: number;
  warnings: number;
  /** True when at least one finding is an error — publish is blocked. */
  blocked: boolean;
  /** Per-difficulty counts, for the tab badges. */
  perDifficulty: Record<Difficulty, { errors: number; warnings: number }>;
}

/** The empty result, used before the first run and after a reset. */
export const EMPTY_LINT: LintResult = {
  revision: -1,
  findings: [],
  errors: 0,
  warnings: 0,
  blocked: false,
  perDifficulty: {
    easy: { errors: 0, warnings: 0 },
    normal: { errors: 0, warnings: 0 },
    hard: { errors: 0, warnings: 0 },
    expert: { errors: 0, warnings: 0 },
  },
};

/**
 * A `LintFinding` carries the difficulty it belongs to only through this field,
 * which the rules module does not know about. Adding it here rather than
 * threading a difficulty through every rule keeps the shared module ignorant of
 * the four-tier document the editor happens to hold.
 */
export interface ScopedFinding extends LintFinding {
  difficulty: Difficulty;
}

/**
 * Beat times from the timing map.
 *
 * Derived rather than stored: a chart's grid is its timing points, and once
 * phase 8 lets an author move a BPM marker, any cached beat array is wrong the
 * moment they drag it. Capped so a corrupt 1-BPM timing point cannot spin here
 * forever — at 10 000 beats the off-grid rule has long since stopped being
 * meaningful anyway.
 */
const MAX_BEATS = 10_000;

export function beatTimes(points: readonly TimingPoint[], duration: number): number[] {
  if (points.length === 0 || !(duration > 0)) return [];
  const out: number[] = [];
  for (let beat = 0; out.length < MAX_BEATS; beat++) {
    const time = timeAtBeat(beat, points);
    if (!Number.isFinite(time)) break;
    if (time > duration) break;
    // A degenerate timing point (bpm 0, or a later point earlier in time) can
    // make this stop advancing; bail rather than emit a million identical beats.
    if (out.length > 0 && time <= out[out.length - 1]) break;
    out.push(time);
  }
  return out;
}

function toLintNote(note: EditorNote): LintNote {
  return {
    id: note.id,
    time: note.time,
    lane: note.lane,
    type: note.type,
    ...(note.duration != null ? { duration: note.duration } : {}),
  };
}

export interface BuildRequestInput {
  charts: Charts;
  timingPoints: readonly TimingPoint[];
  duration: number;
  revision: number;
  checkNesting?: boolean;
}

export function buildLintRequest(input: BuildRequestInput): LintRequest {
  return {
    revision: input.revision,
    duration: input.duration,
    beats: beatTimes(input.timingPoints, input.duration),
    charts: DIFFICULTIES.map((difficulty) => ({
      difficulty,
      notes: input.charts[difficulty].notes.map(toLintNote),
    })),
    checkNesting: input.checkNesting !== false,
  };
}

/**
 * Run every rule over every difficulty. This is the function the worker calls.
 *
 * All four tiers, not just the open one, because publish gates the *document*:
 * an author who fixes Expert and publishes without ever opening Easy would
 * otherwise ship the broken tier, and finding that out from a player is the
 * worst possible time.
 */
export function runLint(request: LintRequest): LintResult {
  const findings: ScopedFinding[] = [];
  const perDifficulty: Record<Difficulty, { errors: number; warnings: number }> = {
    easy: { errors: 0, warnings: 0 },
    normal: { errors: 0, warnings: 0 },
    hard: { errors: 0, warnings: 0 },
    expert: { errors: 0, warnings: 0 },
  };

  for (const chart of request.charts) {
    // A tier with no notes at all is a tier the author has not written yet, not
    // a 4-minute empty stretch. Silence beats a panel full of noise about work
    // that has not started.
    if (chart.notes.length === 0) continue;
    const scoped = lintNotes({
      difficulty: chart.difficulty,
      notes: chart.notes,
      duration: request.duration,
      beats: request.beats.length >= 2 ? request.beats : undefined,
    }).map((finding) => ({ ...finding, difficulty: chart.difficulty }));
    findings.push(...scoped);
  }

  if (request.checkNesting) {
    for (let i = 0; i < request.charts.length - 1; i++) {
      const lower = request.charts[i];
      const higher = request.charts[i + 1];
      if (lower.notes.length === 0 || higher.notes.length === 0) continue;
      findings.push(
        ...lintNesting(lower, higher).map((finding) => ({
          ...finding,
          difficulty: lower.difficulty,
        })),
      );
    }
  }

  findings.sort((a, b) => a.time - b.time);
  for (const finding of findings) {
    const bucket = perDifficulty[finding.difficulty];
    if (finding.severity === 'error') bucket.errors++;
    else bucket.warnings++;
  }

  const { errors, warnings } = countBySeverity(findings);
  return {
    revision: request.revision,
    findings,
    errors,
    warnings,
    blocked: errors > 0,
    perDifficulty,
  };
}

/**
 * Lint one chart in its stored (wire) shape — the API's entry point.
 *
 * The route has a `Slice[]` and a `Song`, not an editor document, and it must
 * reach the same verdict the editor showed the author: a chart the panel called
 * clean has to be publishable, or the button lies. Same rules, same module, one
 * chart at a time (the cross-difficulty nesting rule needs the whole document
 * and is checked where a document exists).
 */
export function lintWireChart(input: {
  difficulty: Difficulty;
  notes: readonly LintNote[];
  duration: number;
  timingPoints?: readonly TimingPoint[] | null;
  bpm?: number | null;
}): LintFinding[] {
  const points =
    input.timingPoints && input.timingPoints.length > 0
      ? input.timingPoints
      : singleTimingPoint(input.bpm && input.bpm > 0 ? input.bpm : 120);
  const beats = beatTimes(points, input.duration);
  return lintNotes({
    difficulty: input.difficulty,
    notes: input.notes,
    duration: input.duration,
    beats: beats.length >= 2 ? beats : undefined,
  });
}

/**
 * Findings for one difficulty, keyed by note id.
 *
 * The timeline reads this per note per frame, so it has to be a map rather than
 * a filter: an 1800-note Expert chart with 40 findings would otherwise be 72 000
 * comparisons a frame, which is exactly the shape of cost that turns a 3 ms
 * draw into a 30 ms one.
 */
export function issuesByNote(
  result: LintResult,
  difficulty: Difficulty,
): Map<string, LintIssue[]> {
  const map = new Map<string, LintIssue[]>();
  for (const finding of result.findings as ScopedFinding[]) {
    if (finding.difficulty !== difficulty) continue;
    if (!finding.noteId) continue;
    const issue: LintIssue = {
      code: finding.code,
      severity: finding.severity,
      message: finding.message,
    };
    const existing = map.get(finding.noteId);
    if (existing) existing.push(issue);
    else map.set(finding.noteId, [issue]);
  }
  return map;
}

export interface LintGroup {
  code: LintCode;
  severity: LintSeverity;
  findings: ScopedFinding[];
}

/**
 * Grouped by code, errors first, then by count.
 *
 * §9's panel design: one row per rule with a count, expandable. Forty separate
 * "off-grid" rows is a list nobody reads; "off-grid × 40" is a decision.
 */
export function groupFindings(
  result: LintResult,
  difficulty?: Difficulty,
): LintGroup[] {
  const groups = new Map<LintCode, LintGroup>();
  for (const finding of result.findings as ScopedFinding[]) {
    if (difficulty && finding.difficulty !== difficulty) continue;
    const existing = groups.get(finding.code);
    if (existing) existing.findings.push(finding);
    else groups.set(finding.code, { code: finding.code, severity: finding.severity, findings: [finding] });
  }
  return [...groups.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return b.findings.length - a.findings.length;
  });
}
