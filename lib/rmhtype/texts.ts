/**
 * RMHType saved texts (s10-05): a member's private library of texts to practise. Pure and client-safe, and
 * zod-free (the zod schemas are in `./texts-schema`), so the panel that saves a pasted test can check a text
 * without loading a validator.
 *
 * A text is private to its owner: never on a board, never shared. The run figures kept on it are the member's own
 * record, scored in the browser and re-checked on the server (`validateTextRun`).
 */
import { MAX_WPM } from '@/lib/rmhtype/typing-run';

/** A member keeps at most this many texts. */
export const MAX_TEXTS_PER_MEMBER = 50;
export const TEXT_TITLE_MAX = 80;
export const TEXT_BODY_MIN = 20;
export const TEXT_BODY_MAX = 3000;
/** The newest runs kept per text; older ones are trimmed on insert. */
export const MAX_RUNS_PER_TEXT = 50;

/** Why a title or body was refused. The page turns each into a sentence. */
export type TextProblem = 'empty' | 'too-short' | 'too-long' | 'control-characters';

/** Control characters other than the line break, the line and paragraph separators, and bidi overrides. */
// eslint-disable-next-line no-control-regex -- the point of the check
const REFUSED_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/;

export type Normalised = { ok: true; value: string } | { ok: false; problem: TextProblem };

/**
 * A title: whitespace runs become one space, ends trimmed, 1 to {@link TEXT_TITLE_MAX} characters.
 * Tabs and line breaks inside a title are whitespace here, not refused.
 */
export function normaliseTextTitle(raw: string): Normalised {
  // eslint-disable-next-line no-control-regex -- the point of the check
  if (/[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/.test(raw)) {
    return { ok: false, problem: 'control-characters' };
  }
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value.length === 0) return { ok: false, problem: 'empty' };
  if (value.length > TEXT_TITLE_MAX) return { ok: false, problem: 'too-long' };
  return { ok: true, value };
}

/**
 * A body: `\r\n` and `\r` become `\n`, each tab becomes two spaces (as code snippets already are), the ends are
 * trimmed, and any other control character refuses the text. Line breaks are kept. 20 to 3,000 characters after
 * normalising.
 */
export function normaliseTextBody(raw: string): Normalised {
  const value = raw.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').trim();
  if (REFUSED_CHARS.test(value)) return { ok: false, problem: 'control-characters' };
  if (value.length === 0) return { ok: false, problem: 'empty' };
  if (value.length < TEXT_BODY_MIN) return { ok: false, problem: 'too-short' };
  if (value.length > TEXT_BODY_MAX) return { ok: false, problem: 'too-long' };
  return { ok: true, value };
}

/** What the browser reports for one finished run on a text. */
export interface TextRunFigures {
  wpm: number;
  accuracy: number;
  timeMs: number;
  /** How many characters the member typed; at most the body's length. */
  typedLength: number;
}

/**
 * The server's re-check of a run against the stored body: typed length within the body, speed at most
 * {@link MAX_WPM}, accuracy 0 to 100, `timeMs` at least 1. The figures are the member's own record on a private
 * text, so this keeps the record sane rather than guarding a board.
 */
export function validateTextRun(run: TextRunFigures, bodyLength: number): boolean {
  return (
    Number.isFinite(run.wpm) &&
    run.wpm >= 0 &&
    run.wpm <= MAX_WPM &&
    Number.isFinite(run.accuracy) &&
    run.accuracy >= 0 &&
    run.accuracy <= 100 &&
    Number.isInteger(run.timeMs) &&
    run.timeMs >= 1 &&
    Number.isInteger(run.typedLength) &&
    run.typedLength >= 1 &&
    run.typedLength <= bodyLength &&
    // The browser scores net words (correct characters / 5 over the elapsed minutes), so it can never exceed the
    // gross speed of the characters typed in that time. A little slack covers the one-decimal rounding.
    run.wpm <= (run.typedLength / 5 / (run.timeMs / 60000)) * 1.01 + 0.1
  );
}

/** Whether a run beats the stored best (the first run always does). */
export function beatsBest(best: number | null | undefined, value: number): boolean {
  return best === null || best === undefined || value > best;
}

/* -------------------------------------------------------------------------- */
/* Shapes shared by the contract, the server and the pages                    */
/* -------------------------------------------------------------------------- */

export interface TextSummary {
  id: string;
  title: string;
  bestWpm: number | null;
  bestAccuracy: number | null;
  runs: number;
  lastRunAt: string | null;
  updatedAt: string;
}

export interface TextDetail extends TextSummary {
  body: string;
}

export interface TextRunRow {
  id: string;
  wpm: number;
  accuracy: number;
  timeMs: number;
  createdAt: string;
}
