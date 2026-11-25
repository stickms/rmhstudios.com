/**
 * Puzzle reports and the admin's look at coming puzzles (sprint 14, feature 06). Pure: no database, no network, so
 * the client dialog and the server share one list of kinds and one date window.
 *
 * Day keys are America/New_York days, the same days the daily desk uses. Time zones go through `lib/calendar/tz`.
 */
import { addDays, dayOf, wallToUtcMs, parseDay } from '@/lib/calendar/tz';
import type { DailyPuzzleMode } from '@/lib/daily-puzzles/generate-core';

export const PUZZLE_TZ = 'America/New_York';

/**
 * The modes a model writes (`AI_PUZZLE_MODES` in `generate-core`, which a test holds this equal to). Written out
 * here because `generate-core` imports zod and the puzzle screens must not.
 */
export const REPORTABLE_MODES = ['alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'] as const;

export function isReportableMode(mode: string): mode is DailyPuzzleMode {
  return (REPORTABLE_MODES as readonly string[]).includes(mode);
}

/** What a member can say is wrong, in the order the dialog lists them. */
export const REPORT_KINDS = ['two-answers', 'wrong-answer', 'unclear', 'other'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_NOTE_MAX = 300;

/** A report is accepted for today and the previous 13 days: the archive the hub shows. */
export const REPORT_WINDOW_DAYS = 13;

/** A replacement or an early generation covers the next two days only. */
export const AHEAD_DAYS = 2;

/** A day that starts within this many minutes can no longer be replaced (clock skew and the slow model call). */
export const REPLACE_MARGIN_MS = 10 * 60_000;

/** How many past days the admin page lists beside today and the next two. */
export const ADMIN_PAST_DAYS = 7;

export function isReportKind(value: string): value is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(value);
}

/** The puzzle day an instant falls on. */
export function puzzleDayOf(ms: number): string {
  return dayOf(ms, PUZZLE_TZ);
}

/** The instant a puzzle day starts (midnight in New York). */
export function puzzleDayStartMs(dateKey: string): number {
  const p = parseDay(dateKey);
  if (!p) throw new Error(`bad day: ${dateKey}`);
  return wallToUtcMs({ y: p.y, mo: p.mo, d: p.d, h: 0, mi: 0 }, PUZZLE_TZ);
}

/** Is `dateKey` a real day from 13 days before `today` up to `today`? */
export function isReportableDay(dateKey: string, today: string): boolean {
  if (!parseDay(dateKey)) return false;
  return dateKey <= today && dateKey >= addDays(today, -REPORT_WINDOW_DAYS);
}

/** The days the admin page lists, newest first: today + 2 down to today - 7. */
export function adminDayKeys(today: string): string[] {
  const out: string[] = [];
  for (let n = AHEAD_DAYS; n >= -ADMIN_PAST_DAYS; n--) out.push(addDays(today, n));
  return out;
}

export type DayRelation = 'future' | 'today' | 'past';

export function relationOf(dateKey: string, today: string): DayRelation {
  if (dateKey > today) return 'future';
  return dateKey === today ? 'today' : 'past';
}

/** Is `dateKey` one of the next two days after `today`? */
export function isAheadDay(dateKey: string, today: string): boolean {
  if (!parseDay(dateKey)) return false;
  return dateKey > today && dateKey <= addDays(today, AHEAD_DAYS);
}

export type ReplaceTiming = 'ok' | 'outside-window' | 'started';

/**
 * May a puzzle day still be replaced at this instant (before the score check)? `outside-window` is a day that is not
 * one of the next two; `started` is a day too close to its start (inside the margin) or already begun.
 */
export function replaceTiming(dateKey: string, nowMs: number): ReplaceTiming {
  const today = puzzleDayOf(nowMs);
  if (!isAheadDay(dateKey, today)) return dateKey <= today ? 'started' : 'outside-window';
  return puzzleDayStartMs(dateKey) - nowMs > REPLACE_MARGIN_MS ? 'ok' : 'started';
}

/* ── The puzzle and its answer, as plain text for the admin page ─────────────────────────────────────────────── */

export interface PuzzleText {
  /** What the player sees. */
  puzzle: string;
  /** The solution and its explanation: admin only. */
  answer: string;
}

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}
function lines(...parts: string[]): string {
  return parts.filter((p) => p.length > 0).join('\n');
}

/**
 * Plain text for a stored puzzle row. Defensive on purpose: the row is JSON a model wrote, validated for shape but
 * read here by an admin who must be able to see even an odd one.
 */
export function describePuzzle(mode: DailyPuzzleMode, data: unknown): PuzzleText {
  const d = obj(data);
  switch (mode) {
    case 'alibi': {
      const sol = obj(d._solution);
      const contradiction = obj(sol.contradiction);
      return {
        puzzle: lines(str(d.scenario), ...arr(d.suspects).map((s) => `${str(obj(s).name)}: ${str(obj(s).alibi)}`)),
        answer: lines(`Guilty: ${str(sol.guiltyName)}`, str(contradiction.explanation)),
      };
    }
    case 'spectrum':
      return {
        puzzle: lines(str(d.label), ...arr(d.items).map((i) => str(obj(i).name))),
        answer: lines(
          ...arr(d._solution)
            .map((i) => obj(i))
            .sort((a, b) => Number(a.trueRank) - Number(b.trueRank))
            .map((i) => `${str(i.trueRank)}. ${str(i.name)} (${str(i.displayValue)})`),
          str(d._funFact),
        ),
      };
    case 'outcast':
      return {
        puzzle: lines(
          ...arr(d.rounds).map((r) => {
            const round = obj(r);
            return `Round ${str(round.roundNumber)}: ${arr(round.items)
              .map((i) => str(obj(i).name))
              .join(', ')}`;
          }),
        ),
        answer: lines(
          ...arr(d.rounds).map((r) => {
            const round = obj(r);
            const sol = obj(round._solution);
            return `Round ${str(round.roundNumber)}: ${str(sol.outcastName)} (${str(sol.trait)}; red herring: ${str(sol.redHerring)})`;
          }),
        ),
      };
    case 'chainlink':
      return {
        puzzle: lines(`${str(d.startWord)} to ${str(d.endWord)}`, `Par: ${str(d.parLinks)} links`),
        answer: lines(arr(d._exampleChain).map(str).join(' > '), ...arr(d._connectionExplanations).map(str)),
      };
    case 'impostor':
      return {
        puzzle: lines(str(d.topic), ...arr(d.statements).map((s) => str(obj(s).text))),
        answer: lines(
          ...arr(d._solution).map((s) => {
            const st = obj(s);
            return `${st.isFake === true ? 'Fake' : 'True'}: ${str(st.text)} (${str(st.explanation)})`;
          }),
        ),
      };
  }
}
